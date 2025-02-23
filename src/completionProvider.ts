// src/completionProvider.ts
import * as vscode from "vscode";
import { ScssVariable } from "./jsonLoader";
import { LocalDefinition } from "./deepScanner";
import { Trie } from "./trie";

/**
 * Registers a completion provider that suggests SCSS variables in CSS/SCSS files.
 * Uses a Trie for fast prefix matching, supports JSON and local variables, and filters by CSS properties.
 *
 * @param variablesMap - A map of variable names from the JSON file to their details.
 * @param getLocalDefinitions - A function to fetch locally defined variables from the workspace.
 * @returns A disposable object to unregister the provider when the extension stops.
 */
export function registerScssCompletionProvider(
  variablesMap: Map<string, ScssVariable>,
  getLocalDefinitions: () => LocalDefinition[]
): vscode.Disposable {
  // Create a Trie to store variable names for quick searching.
  const trie = new Trie();
  // Add all JSON variable names to the Trie.
  variablesMap.forEach((_, key) => trie.insert(key));
  // Add all local variable names to the Trie (updated dynamically later).
  getLocalDefinitions().forEach((def) => trie.insert(def.name));

  // Register the provider for SCSS and CSS files, triggered by "(", "-", or space (for Ctrl+Space).
  return vscode.languages.registerCompletionItemProvider(
    [{ language: "scss" }, { language: "css" }],
    {
      /**
       * Provides completion suggestions when the user types in a file.
       * @param document - The file being edited.
       * @param position - The cursor’s position in the file.
       * @returns An array of completion items or undefined if none apply.
       */
      provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
      ): vscode.ProviderResult<vscode.CompletionItem[]> {
        // Get the current line of text up to the cursor.
        const lineText: string = document.lineAt(position).text;
        // Split the line by semicolons to focus on the current CSS rule.
        const segments = lineText.split(";");
        const currentSegment = segments[segments.length - 1]; // The last segment is the active one.

        // Check if "var(" is present in the current segment.
        const varPos = currentSegment.lastIndexOf("var(");
        if (varPos === -1) {
          return [];
        } // No "var(", so no suggestions.

        // Extract what comes after "var(" to see what the user typed.
        const afterVarText = currentSegment.substring(varPos + 4);
        const trimmedAfterVar = afterVarText.replace(/^\s*/, ""); // Remove leading spaces.
        // Calculate where the typed text starts after "var(".
        let relativeStart =
          varPos + 4 + (afterVarText.length - trimmedAfterVar.length);
        // Skip "--" if already typed to avoid duplication.
        if (trimmedAfterVar.startsWith("--")) {
          relativeStart += 2;
        }

        // Clean up the typed prefix by removing ")" or ";".
        const typedPrefix = currentSegment
          .substring(relativeStart)
          .replace(/[);]/g, "")
          .trim();

        // Determine where in the document to insert the suggestion.
        const segmentAbsoluteStart = lineText.lastIndexOf(currentSegment);
        const replacementStart = segmentAbsoluteStart + relativeStart;
        const replacementRange = new vscode.Range(
          new vscode.Position(position.line, replacementStart),
          position
        );

        // Extract the CSS property (e.g., "color" from "color: var(").
        const propertyMatch = currentSegment.match(/([\w-]+)\s*:\s*var\(/);
        const cssProperty = propertyMatch ? propertyMatch[1].toLowerCase() : "";

        // Track variables already used in the document to avoid duplicates.
        const usedVariables: Set<string> = new Set();
        const usedRegex = /var\(\s*--([\w-]+)\s*\)/g;
        let usedMatch: RegExpExecArray | null;
        while ((usedMatch = usedRegex.exec(document.getText())) !== null) {
          usedVariables.add(usedMatch[1]);
        }

        // Array to hold all completion suggestions.
        const completions: vscode.CompletionItem[] = [];
        // Get local definitions from the workspace.
        const localDefs = getLocalDefinitions();
        const localMap = new Map<string, LocalDefinition[]>();
        localDefs.forEach((def) => {
          if (!localMap.has(def.name)) {
            localMap.set(def.name, []);
          }
          localMap.get(def.name)?.push(def); // Group local defs by name.
        });

        // Use the Trie to find matching variable names based on the prefix.
        const candidateNames = typedPrefix
          ? trie.find(typedPrefix)
          : [...variablesMap.keys(), ...localMap.keys()]; // If no prefix, include all.

        // Loop through each candidate to create suggestions.
        for (const varName of candidateNames) {
          if (usedVariables.has(varName)) {
            continue;
          } // Skip already-used variables.

          // Handle JSON-defined variables (Design System).
          if (variablesMap.has(varName)) {
            const variable = variablesMap.get(varName)!;
            // Filter by CSS property if one is present.
            if (cssProperty && variable.cssAttributesSupported) {
              const supported = variable.cssAttributesSupported.some(
                (attr) => attr.toLowerCase() === cssProperty
              );
              if (!supported) {
                continue;
              } // Skip if property isn’t supported.
            }
            // Create a completion item for this variable.
            const item = new vscode.CompletionItem(
              `[Design System] ${varName}`
            );
            const colorValue = extractColorValue(variable.value);
            if (colorValue) {
              // If it’s a color, show a preview in the dropdown.
              item.label = {
                label: `[Design System] ${varName}`,
                description: colorValue,
              };
              item.detail = colorValue;
              item.kind = vscode.CompletionItemKind.Color;
            } else {
              item.kind = vscode.CompletionItemKind.Variable;
            }
            // Add detailed documentation in Markdown.
            const md = new vscode.MarkdownString();
            md.appendMarkdown(`**Description:** ${variable.description}\n\n`);
            md.appendMarkdown(
              `**Value:**\n\`\`\`css\n${JSON.stringify(
                variable.value,
                null,
                2
              )}\n\`\`\`\n\n`
            );
            md.appendMarkdown(`**Source:** Design System (JSON)`);
            item.documentation = md;
            item.insertText = `--${varName}`; // What gets inserted.
            item.range = replacementRange; // Where it goes.
            item.sortText = "0"; // JSON vars sort first.
            completions.push(item);
          }

          // Handle locally defined variables.
          if (localMap.has(varName)) {
            const defs = localMap.get(varName)!;
            defs.forEach((def) => {
              const item = new vscode.CompletionItem(`[Local] ${varName}`);
              item.kind = vscode.CompletionItemKind.Variable;
              const md = new vscode.MarkdownString();
              // Show where it’s defined and its value.
              md.appendMarkdown(
                `**Local Definition:**\nDefined in [${
                  def.fileUri.fsPath
                }] at line ${def.line + 1}\n\n`
              );
              md.appendMarkdown(`\`\`\`\n${def.value}\n\`\`\``);
              item.documentation = md;
              item.insertText = `--${varName}`;
              item.range = replacementRange;
              item.sortText = "1"; // Local vars sort after JSON.
              completions.push(item);
            });
          }
        }
        return completions; // Return all suggestions to VS Code.
      },
    },
    "(", // Trigger after "(" in "var(".
    "-", // Trigger after "-" in "--".
    " " // Trigger on space (e.g., for Ctrl+Space).
  );
}

/**
 * Extracts the first hexadecimal color code from a set of CSS values.
 * Used to show color previews in the completion dropdown.
 *
 * @param value - An object with theme keys (e.g., "light") and CSS values (e.g., "#ff0000").
 * @returns The first hex color found, or undefined if none exists.
 */
function extractColorValue(value: Record<string, string>): string | undefined {
  // Loop through all values in the object.
  for (const val of Object.values(value)) {
    // Look for a 6-digit hex color code (e.g., #FF0000).
    const hexMatch = val.match(/#[0-9a-fA-F]{6}/);
    if (hexMatch) {
      return hexMatch[0];
    } // Return the first match.
  }
  return undefined; // No hex color found.
}
