// File: src/completion.ts

/**
 * This module handles the autocompletion logic for SCSS variables.
 * It builds a cache of completion items from the design tokens and
 * registers a completion provider that filters these items based on:
 *   - The CSS property where the variable is used.
 *   - A fuzzy match against the variable name.
 */

import * as vscode from "vscode"; // VS Code API.
import { IScssVariable } from "./types"; // Import our design token type.

// Export a global cache to store built completion items.
// This helps avoid rebuilding the same items repeatedly.
export let cachedCompletionItems: vscode.CompletionItem[] = [];

/**
 * Builds an array of completion items from the given design tokens.
 *
 * @param variables - An object mapping token names to IScssVariable objects.
 * @returns An array of vscode.CompletionItem objects.
 *
 * Each completion item is built with:
 *  - A label (e.g., "--color-primary")
 *  - An insert text that is only the variable name (e.g., "--color-primary")
 *    so that when the user types "var(--" and selects an item, the final result is correct.
 *  - Documentation that shows the description, values, and supported CSS attributes.
 */
function buildCompletionItems(
  variables: { [key: string]: IScssVariable }
): vscode.CompletionItem[] {
  return Object.entries(variables).map(([originalKey, varData]) => {
    // Create a label with two dashes prefixed.
    const label = `--${originalKey}`;
    // Create a new completion item with the label.
    const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Variable);

    // Set the insertText to just the variable name (with dashes).
    // This prevents duplicating "var(--" which the user already typed.
    item.insertText = new vscode.SnippetString(`--${originalKey}`);

    // Initialize a details string for the documentation.
    let details = "";
    // If there is a description, add it.
    if (varData.description) {
      details += `**Description:** ${varData.description}\n\n`;
    }
    // If the value is an object, list all variants.
    if (typeof varData.value === "object") {
      details += "**Values:**\n";
      for (const variant in varData.value) {
        details += `- **${variant}**: ${varData.value[variant]}\n`;
      }
    } else {
      // Otherwise, show the single value.
      details += `**Value:** ${varData.value}\n`;
    }
    // Append the list of supported CSS attributes.
    details += `\n**CSS Attributes Supported:** ${varData.cssAttributesSupported.join(", ")}`;
    // Set the documentation of the completion item as a Markdown string.
    item.documentation = new vscode.MarkdownString(details);

    return item;
  });
}

/**
 * Updates the global cache of completion items.
 *
 * @param variables - The latest design tokens.
 *
 * This function rebuilds the cachedCompletionItems array so that the completion provider
 * uses up-to-date information.
 */
export function updateCompletionItems(
  variables: { [key: string]: IScssVariable }
): void {
  cachedCompletionItems = buildCompletionItems(variables);
}

/**
 * A simple fuzzy matching function.
 *
 * @param pattern - The pattern to search for.
 * @param text - The text in which to search.
 * @returns True if every character in 'pattern' appears in 'text' in order.
 *
 * This helps filter the completion items based on partial user input.
 */
function fuzzyMatch(pattern: string, text: string): boolean {
  let pIndex = 0;
  let tIndex = 0;
  // Convert both strings to lowercase for case-insensitive comparison.
  pattern = pattern.toLowerCase();
  text = text.toLowerCase();
  // Iterate over both strings.
  while (pIndex < pattern.length && tIndex < text.length) {
    if (pattern[pIndex] === text[tIndex]) {
      pIndex++; // Move to the next character in the pattern if matched.
    }
    tIndex++; // Always move forward in the text.
  }
  // If we've matched all characters in the pattern, return true.
  return pIndex === pattern.length;
}

/**
 * Registers the SCSS completion provider with VS Code.
 *
 * @param getVariables - A callback function that returns the current design tokens.
 * @returns A Disposable that unregisters the completion provider when disposed.
 *
 * The completion provider listens for completion requests in SCSS and module SCSS files.
 * It extracts the CSS property (e.g., "color") and the partial variable name the user has typed,
 * then filters the cachedCompletionItems accordingly:
 *   - It only suggests tokens that support the CSS property (from cssAttributesSupported).
 *   - It applies fuzzy matching on the variable name.
 */
export function registerScssCompletionProvider(
  getVariables: () => { [key: string]: IScssVariable }
): vscode.Disposable {
  return vscode.languages.registerCompletionItemProvider(
    ["scss", "module.scss"], // Languages where the provider is active.
    {
      /**
       * Provides completion items for the current document and cursor position.
       *
       * @param document - The current text document.
       * @param position - The current cursor position.
       * @returns An array of completion items that match the current context, or undefined.
       */
      provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
        // Get the text of the current line up to the cursor.
        const lineText = document.lineAt(position).text.substring(0, position.character);

        // Use a regular expression to match lines like:
        // "color: var(--" or "color: var(--colo"
        // This captures the CSS property (e.g., "color") and any partial variable text (e.g., "colo").
        const propertyRegex = /^\s*([a-zA-Z-]+)\s*:\s*var\(--([\w-]*)/;
        const match = lineText.match(propertyRegex);
        if (!match) {
          // If the line does not match, return undefined (no suggestions).
          return undefined;
        }

        // Extract the CSS property name and convert it to lowercase.
        const propertyName = match[1].toLowerCase();
        // Extract any partial variable text the user has typed after "var(--".
        const partialVar = match[2] ? match[2].toLowerCase() : "";

        // Retrieve the latest design tokens.
        const allVariables = getVariables();

        // Filter the globally cached completion items:
        // 1. The token's "cssAttributesSupported" must include the CSS property.
        // 2. The token name must fuzzy-match the partial text (if any).
        const filteredItems = cachedCompletionItems.filter((item) => {
          // Remove the leading dashes to get the original token key.
          const originalLabel = item.label.toString(); // e.g., "--color-primary"
          const keyWithoutDashes = originalLabel.replace(/^--/, ""); // "color-primary"

          // Perform fuzzy matching if the user has typed part of the variable name.
          const fuzzyOk = partialVar ? fuzzyMatch(partialVar, keyWithoutDashes) : true;

          // Look up the design token data using the token name.
          const varData = allVariables[keyWithoutDashes];
          if (!varData) {
            return false;
          }
          // Check whether the token supports the CSS property (ignoring case).
          const propertySupported = varData.cssAttributesSupported.some(
            (attr) => attr.toLowerCase() === propertyName
          );

          // Only include this item if both conditions are met.
          return fuzzyOk && propertySupported;
        });

        // Sort the filtered items alphabetically by their label.
        filteredItems.sort((a, b) => {
          return a.label.toString().localeCompare(b.label.toString());
        });

        return filteredItems;
      },
    },
    "-", " " // Trigger completion when '-' or ' ' (space) is typed.
  );
}
