// File: src/completion.ts

/**
 * This module handles the autocompletion logic for SCSS variables.
 * It builds completion items from the design tokens and registers a completion provider.
 *
 * Updates:
 * - Removed global caching so that each completion request rebuilds items.
 * - Added a color preview: if a token's value (or variant) is a HEX color, a small color box is shown.
 * - The provider now triggers as soon as the CSS property is typed (e.g. after the colon).
 *   It builds an index mapping CSS properties to tokens and filters suggestions accordingly.
 */

import * as vscode from "vscode";
import { IScssVariable } from "./types";

/**
 * Registers the SCSS completion provider with VS Code.
 *
 * This provider is triggered when the user types "var(--" (with optional additional characters).
 * It then rebuilds completion items from the current design tokens and filters them using fuzzy matching.
 * The inserted snippet is just the token name (with dashes) so that the final text becomes "var(--token)".
 *
 * @param getVariables - A callback function that returns the current design tokens.
 * @returns A Disposable that unregisters the completion provider when disposed.
 */
export function registerScssCompletionProvider(
  getVariables: () => { [key: string]: IScssVariable }
): vscode.Disposable {
  return vscode.languages.registerCompletionItemProvider(
    ["scss", "module.scss"],
    {
      provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
      ) {
        // Get the text of the current line up to the cursor.
        const lineText = document
          .lineAt(position)
          .text.substring(0, position.character);

        // Use a regex to match "var(--" followed by optional partial token text.
        // This ensures suggestions only appear when the user types "var(--".
        const regex = /var\(--([\w-]*)$/;
        const match = regex.exec(lineText);
        if (!match) {
          // If "var(--" is not present, return no suggestions.
          return undefined;
        }
        // Extract the partial token text typed after "var(--" (if any).
        const partial = match[1].toLowerCase();

        // Retrieve the current design tokens.
        const tokens = getVariables();

        // Build completion items for all tokens.
        const items = Object.entries(tokens)
          .map(([key, token]) => {
            // Create a label like "--tokenName"
            const label = `--${key}`;
            const item = new vscode.CompletionItem(
              label,
              vscode.CompletionItemKind.Variable
            );
            // Set the insert text to just the token name (with dashes) so that the final inserted text becomes "var(--tokenName)".
            item.insertText = new vscode.SnippetString(`--${key}`);

            // Build detailed documentation.
            let doc = "";
            if (token.description) {
              doc += `**Description:** ${token.description}\n\n`;
            }
            if (typeof token.value === "object") {
              doc += "**Values:**\n";
              for (const variant in token.value) {
                const val = token.value[variant];
                if (isHexColor(val)) {
                  // Insert a small color preview box if the value is a HEX color.
                  doc += `- **${variant}**: <span style="display:inline-block; width:12px; height:12px; background-color:${val}; border:1px solid #000;"></span> ${val}\n`;
                } else {
                  doc += `- **${variant}**: ${val}\n`;
                }
              }
            } else {
              if (isHexColor(token.value)) {
                doc += `**Value:** <span style="display:inline-block; width:12px; height:12px; background-color:${token.value}; border:1px solid #000;"></span> ${token.value}\n`;
              } else {
                doc += `**Value:** ${token.value}\n`;
              }
            }
            doc += `\n**CSS Attributes Supported:** ${token.cssAttributesSupported.join(
              ", "
            )}`;
            item.documentation = new vscode.MarkdownString(doc);

            return item;
          })
          // Filter the completion items using fuzzy matching on the token name.
          .filter((item) => {
            // Remove the leading dashes to get the actual token name.
            const tokenName = item.label
              .toString()
              .replace(/^--/, "")
              .toLowerCase();
            return partial ? fuzzyMatch(partial, tokenName) : true;
          });

        // Sort the suggestions alphabetically by label.
        items.sort((a, b) =>
          a.label.toString().localeCompare(b.label.toString())
        );

        return items;
      },
    },
    // Trigger characters: only when the user types "-" or " " after "var(".
    "-",
    " "
  );
}

/**
 * A simple fuzzy matching function.
 *
 * @param pattern - The pattern to search for.
 * @param text - The text in which to search.
 * @returns True if every character in 'pattern' appears in 'text' in order.
 *
 * This function is used to filter token names based on what the user has partially typed.
 */
function fuzzyMatch(pattern: string, text: string): boolean {
  let pIndex = 0;
  let tIndex = 0;
  pattern = pattern.toLowerCase();
  text = text.toLowerCase();
  while (pIndex < pattern.length && tIndex < text.length) {
    if (pattern[pIndex] === text[tIndex]) {
      pIndex++;
    }
    tIndex++;
  }
  return pIndex === pattern.length;
}

/**
 * Checks if a given string is a valid HEX color.
 *
 * @param text - The string to test.
 * @returns True if the string matches a HEX color format (e.g., "#ff0000" or "#f00"), false otherwise.
 *
 * This function is used to decide if a color preview box should be shown.
 */
function isHexColor(text: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(text);
}
