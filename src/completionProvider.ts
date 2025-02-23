// src/completionProvider.ts
import * as vscode from "vscode";
import { ScssVariable } from "./jsonLoader";
import { LocalDefinition } from "./deepScanner";

/**
 * Sets up a completion provider that suggests SCSS variables when typing in CSS/SCSS files.
 * Offers suggestions from both JSON-defined variables and local variables in the code.
 * Filters suggestions based on:
 * - The CSS property (e.g., only color variables for "color").
 * - What the user has typed so far (fuzzy matching).
 * - Whether the variable is from JSON or defined locally.
 *
 * @param variablesMap - A map of JSON-defined variable names to their details.
 * @param getLocalDefinitions - A function that returns locally defined variables.
 * @returns A disposable object to clean up the provider when the extension stops.
 */
export function registerScssCompletionProvider(
  variablesMap: Map<string, ScssVariable>,
  getLocalDefinitions: () => LocalDefinition[]
): vscode.Disposable {
  // Register the provider for SCSS and CSS files, triggered by '(' or '-'.
  return vscode.languages.registerCompletionItemProvider(
    [{ language: "scss" }, { language: "css" }],
    {
      // This function runs whenever the user might need suggestions.
      provideCompletionItems(
        document: vscode.TextDocument, // The file being edited.
        position: vscode.Position // Where the cursor is.
      ): vscode.ProviderResult<vscode.CompletionItem[]> {
        // Get the current line of text up to the cursor.
        const lineText: string = document.lineAt(position).text;
        // Split the line by semicolons to focus on the current CSS rule.
        const segments = lineText.split(";");
        const currentSegment = segments[segments.length - 1]; // Last part is the active rule.

        // Check if "var(" exists in the current segment.
        const varPos = currentSegment.lastIndexOf("var(");
        if (varPos === -1) {
          return []; // No "var(", so no suggestions.
        }

        // Get the text after "var(" to see what the user has typed.
        const afterVarText = currentSegment.substring(varPos + 4);
        const trimmedAfterVar = afterVarText.replace(/^\s*/, ""); // Remove leading spaces.
        // Calculate where the typed text starts relative to "var(".
        let relativeStart =
          varPos + 4 + (afterVarText.length - trimmedAfterVar.length);
        // If the user typed "--", skip those characters in the suggestion.
        if (trimmedAfterVar.startsWith("--")) {
          relativeStart += 2; // Move past the "--" so we don’t duplicate it.
        }

        // Clean up whatever the user typed after "var(" by removing closing ")" or ";".
        let typedPrefix = currentSegment.substring(relativeStart);
        typedPrefix = typedPrefix.replace(/[);]/g, "").trim(); // Ensure it’s just the variable name prefix.

        // Figure out where in the document we’ll replace text with the suggestion.
        const segmentAbsoluteStart = lineText.lastIndexOf(currentSegment); // Start of the current rule.
        const replacementStart = segmentAbsoluteStart + relativeStart; // Where the prefix begins.
        const replacementRange = new vscode.Range(
          new vscode.Position(position.line, replacementStart), // Start of replacement.
          position // End at the cursor.
        );

        // Try to figure out which CSS property is being used (e.g., "color" in "color: var(").
        const propertyMatch = currentSegment.match(/([\w-]+)\s*:\s*var\(/);
        const cssProperty = propertyMatch ? propertyMatch[1].toLowerCase() : ""; // Lowercase for consistency.

        // Keep track of variables already used in this file to avoid suggesting them again.
        const usedVariables: Set<string> = new Set();
        const usedRegex = /var\(\s*--([\w-]+)\s*\)/g; // Matches "var(--variableName)".
        let usedMatch: RegExpExecArray | null;
        while ((usedMatch = usedRegex.exec(document.getText())) !== null) {
          usedVariables.add(usedMatch[1]); // Add each found variable name to the set.
        }

        const completions: vscode.CompletionItem[] = []; // List of suggestions to show.
        const localDefs = getLocalDefinitions(); // Get variables defined in the code.
        const localMap = new Map<string, LocalDefinition[]>(); // Group local definitions by name.
        localDefs.forEach((def) => {
          if (!localMap.has(def.name)) {
            localMap.set(def.name, []); // Initialize an array for this name if it doesn’t exist.
          }
          localMap.get(def.name)?.push(def); // Add the definition to the array.
        });

        // Combine all possible variable names from JSON and local definitions.
        const candidateNamesSet = new Set<string>([
          ...Array.from(variablesMap.keys()), // JSON variables.
          ...Array.from(localMap.keys()), // Local variables.
        ]);
        const candidateNames = Array.from(candidateNamesSet); // Convert to array for looping.

        // Loop through each possible variable name to create suggestions.
        for (const varName of candidateNames) {
          // Skip if the variable is already used in this file.
          if (usedVariables.has(varName)) {
            continue;
          }
          // Skip if the user typed something and it doesn’t match this variable.
          if (
            typedPrefix &&
            !varName.toLowerCase().includes(typedPrefix.toLowerCase())
          ) {
            continue; // Fuzzy matching: only suggest if prefix fits.
          }

          // Handle JSON-defined variables.
          if (variablesMap.has(varName)) {
            const variable = variablesMap.get(varName)!; // Get the variable’s details.
            // If there’s a CSS property, check if this variable supports it.
            if (cssProperty && variable.cssAttributesSupported) {
              const supported = variable.cssAttributesSupported.some(
                (attr) => attr.toLowerCase() === cssProperty
              );
              if (!supported) {
                continue; // Skip if the variable can’t be used with this property.
              }
            }
            // Create a suggestion item for this JSON variable.
            const item = new vscode.CompletionItem(`[JSON] ${varName}`);
            const colorValue = extractColorValue(variable.value); // Check if it’s a color.
            if (colorValue) {
              // If it’s a color, show a preview and mark it as a color type.
              item.label = {
                label: `[JSON] ${varName}`,
                description: colorValue,
              };
              item.detail = colorValue;
              item.kind = vscode.CompletionItemKind.Color;
            } else {
              // Otherwise, it’s just a regular variable.
              item.kind = vscode.CompletionItemKind.Variable;
            }
            // Add documentation with description and value in Markdown.
            const md = new vscode.MarkdownString();
            md.appendMarkdown(`**Description:** ${variable.description}\n\n`);
            md.appendMarkdown(
              `**Value:**\n\`\`\`css\n${JSON.stringify(
                variable.value,
                null,
                2
              )}\n\`\`\``
            );
            md.appendMarkdown(`\n**Source:** Design System (JSON)`);
            item.documentation = md;
            item.insertText = `--${varName}`; // What gets inserted when selected.
            item.range = replacementRange; // Where to insert it.
            item.sortText = "0"; // Sort JSON variables first.
            completions.push(item); // Add to the suggestion list.
          }

          // Handle locally defined variables.
          if (localMap.has(varName)) {
            const defs = localMap.get(varName)!; // Get all definitions for this name.
            defs.forEach((def) => {
              // Create a suggestion item for this local variable.
              const item = new vscode.CompletionItem(`[LOCAL] ${varName}`);
              item.kind = vscode.CompletionItemKind.Variable; // Mark as a variable.
              const md = new vscode.MarkdownString();
              // Show where it’s defined and its value.
              md.appendMarkdown(
                `**Local Definition:**\nDefined in [${
                  def.fileUri.fsPath
                }] at line ${def.line + 1}\n\n`
              );
              md.appendMarkdown(`\`\`\`\n${def.value}\n\`\`\``);
              item.documentation = md;
              item.insertText = `--${varName}`; // Insert the variable name.
              item.range = replacementRange; // Where to insert.
              item.sortText = "1"; // Sort local variables after JSON ones.
              completions.push(item); // Add to suggestions.
            });
          }
        }
        return completions; // Return all suggestions to VS Code.
      },
    },
    "(", // Trigger suggestion after typing "(".
    "-" // Trigger after typing "-".
  );
}

/**
 * Looks for a hexadecimal color code (like #FF0000) in a set of CSS values.
 * Used to show color previews in suggestions.
 *
 * @param value - An object with CSS values (e.g., {"light": "#ff0000", "dark": "#00ff00"}).
 * @returns The first hex color found, or undefined if there’s none.
 */
function extractColorValue(value: Record<string, string>): string | undefined {
  // Loop through all values in the object.
  for (const val of Object.values(value)) {
    // Check if the value matches a 6-digit hex color code.
    const hexMatch = val.match(/#[0-9a-fA-F]{6}/);
    if (hexMatch) {
      return hexMatch[0]; // Return the first match we find.
    }
  }
  return undefined; // No hex color found.
}
