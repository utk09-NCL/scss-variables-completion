// src/completionProvider.ts
import * as vscode from "vscode";
import { ScssVariable, CssAttributeMap } from "./jsonLoader";

/**
 * Registers a completion provider for SCSS/CSS files to suggest SCSS variables.
 *
 * @param variablesMap A map of SCSS variable names to their definitions.
 * @param cssAttributeMap A map from CSS attributes to sets of SCSS variable names.
 * @returns A disposable to unregister the completion provider.
 */
export function registerScssCompletionProvider(
  variablesMap: Map<string, ScssVariable>,
  cssAttributeMap: CssAttributeMap
): vscode.Disposable {
  return vscode.languages.registerCompletionItemProvider(
    [{ language: "scss" }, { language: "css" }],
    {
      /**
       * Provides completion items for SCSS variable names.
       *
       * This provider triggers if the current declaration contains any occurrence of "var(",
       * which covers cases like "var(", "var()", "var(--", or "var();". It also triggers when
       * the user manually invokes completion (CTRL+SPACE).
       *
       * @param document The text document in which the completion was triggered.
       * @param position The position in the document at which the completion was triggered.
       * @returns An array of completion items.
       */
      provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
      ): vscode.ProviderResult<vscode.CompletionItem[]> {
        const lineText: string = document.lineAt(position).text;
        // Work on the current declaration (after the last semicolon).
        const segments = lineText.split(";");
        const currentSegment = segments[segments.length - 1];

        // Trigger if the current segment contains "var(" (this covers var(, var(), var(--, var();).
        const varPos = currentSegment.lastIndexOf("var(");
        if (varPos === -1) {
          return [];
        }

        // Get text immediately after "var(".
        const afterVarText = currentSegment.substring(varPos + 4);
        const trimmedAfterVar = afterVarText.replace(/^\s*/, "");
        let relativeStart =
          varPos + 4 + (afterVarText.length - trimmedAfterVar.length);

        // If the user already typed "--", skip them to avoid duplicate dashes.
        if (trimmedAfterVar.startsWith("--")) {
          relativeStart += 2;
        }

        // Remove any trailing ")" if auto-closed, leaving the typed prefix.
        const typedPrefix = currentSegment
          .substring(relativeStart)
          .replace(/\)$/, "")
          .trim();

        // Determine the absolute replacement range.
        const segmentAbsoluteStart = lineText.lastIndexOf(currentSegment);
        const replacementStart = segmentAbsoluteStart + relativeStart;
        const replacementRange = new vscode.Range(
          new vscode.Position(position.line, replacementStart),
          position
        );

        // Try to extract the CSS property (e.g. "padding" from "padding: var(").
        const propertyMatch = currentSegment.match(/([\w-]+)\s*:\s*var\(/);
        const cssProperty = propertyMatch ? propertyMatch[1].toLowerCase() : "";

        // Gather variables already used in the document so we don't show duplicates.
        const usedVariables: Set<string> = new Set();
        const usedRegex = /var\(\s*--([\w-]+)\s*\)/g;
        let usedMatch: RegExpExecArray | null;
        while ((usedMatch = usedRegex.exec(document.getText())) !== null) {
          usedVariables.add(usedMatch[1]);
        }

        // Get candidate variable names, filtering by CSS property if available.
        const candidateNames: string[] = cssAttributeMap.has(cssProperty)
          ? Array.from(cssAttributeMap.get(cssProperty)!)
          : Array.from(variablesMap.keys());

        const completions: vscode.CompletionItem[] = [];
        for (const varName of candidateNames) {
          // Skip if this variable is already used.
          if (usedVariables.has(varName)) {
            continue;
          }
          // Filter by the typed prefix (case-insensitive substring match).
          if (
            typedPrefix &&
            !varName.toLowerCase().includes(typedPrefix.toLowerCase())
          ) {
            continue;
          }
          const variable = variablesMap.get(varName);
          if (!variable) {
            continue;
          }
          const item = new vscode.CompletionItem(varName);

          // Extract a hex color value from the variable's values, if any.
          const colorValue = extractColorValue(variable.value);
          if (colorValue) {
            // Use a structured label so that VS Code shows a color swatch (the left preview square)
            // and display the hex value as secondary text.
            item.label = { label: varName, description: colorValue };
            // Also set detail to the hex color so VS Code renders the swatch.
            item.detail = colorValue;
            item.kind = vscode.CompletionItemKind.Color;
          } else {
            item.label = varName;
            item.kind = vscode.CompletionItemKind.Variable;
          }

          // Build the detailed documentation with description and value.
          const md = new vscode.MarkdownString();
          md.appendMarkdown(`**Description:** ${variable.description}\n\n`);
          md.appendMarkdown(
            `**Value:**\n\`\`\`css\n${JSON.stringify(
              variable.value,
              null,
              2
            )}\n\`\`\``
          );
          item.documentation = md;

          // Use a text edit so that the inserted text always starts with "--".
          item.textEdit = vscode.TextEdit.replace(
            replacementRange,
            `--${varName}`
          );
          item.sortText = "0";
          completions.push(item);
        }
        return completions;
      },
    },
    "(",
    "-" // Also trigger completions on '(' and '-' characters.
  );
}

/**
 * Extracts the first hex color value found in the provided record of CSS values.
 *
 * @param value An object containing CSS values.
 * @returns The first hex color found (e.g. "#ff0000"), or undefined if none exists.
 */
function extractColorValue(value: Record<string, string>): string | undefined {
  for (const val of Object.values(value)) {
    const hexMatch = val.match(/#[0-9a-fA-F]{6}/);
    if (hexMatch) {
      return hexMatch[0];
    }
  }
  return undefined;
}
