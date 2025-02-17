// File: src/completion.ts

import * as vscode from "vscode";
import { IScssVariable } from "./types";

// We'll keep a local cache of all completion items we build.
export let cachedCompletionItems: vscode.CompletionItem[] = [];

/**
 * Build completion items from the given variables.
 */
function buildCompletionItems(
  variables: { [key: string]: IScssVariable }
): vscode.CompletionItem[] {
  return Object.entries(variables).map(([originalKey, varData]) => {
    // The label is --variableName
    const label = `--${originalKey}`;
    const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Variable);

    // When inserted, the snippet becomes: var(--variable-name)
    item.insertText = new vscode.SnippetString(`var(--${originalKey})`);

    // Build details for markdown documentation
    let details = "";
    if (varData.description) {
      details += `**Description:** ${varData.description}\n\n`;
    }
    if (typeof varData.value === "object") {
      details += "**Values:**\n";
      for (const variant in varData.value) {
        details += `- **${variant}**: ${varData.value[variant]}\n`;
      }
    } else {
      details += `**Value:** ${varData.value}\n`;
    }
    details += `\n**CSS Attributes Supported:** ${varData.cssAttributesSupported.join(", ")}`;
    item.documentation = new vscode.MarkdownString(details);

    return item;
  });
}

/**
 * Updates the internal cache of completion items.
 */
export function updateCompletionItems(
  variables: { [key: string]: IScssVariable }
): void {
  cachedCompletionItems = buildCompletionItems(variables);
}

/**
 * Simple fuzzy match:
 * Returns true if every character in `pattern` appears in order in `text`.
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
 * Registers the SCSS completion provider.
 */
export function registerScssCompletionProvider(
  getVariables: () => { [key: string]: IScssVariable }
): vscode.Disposable {
  return vscode.languages.registerCompletionItemProvider(
    ["scss", "module.scss"],
    {
      provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
        const lineText = document.lineAt(position).text.substring(0, position.character);

        // Example match:
        // color: var(--   => propertyName = color, partialVar = ""
        // color: var(--colo => propertyName = color, partialVar = "colo"
        const propertyRegex = /^\s*([a-zA-Z-]+)\s*:\s*var\(--([\w-]*)/;
        const match = lineText.match(propertyRegex);
        if (!match) {
          return undefined;
        }

        const propertyName = match[1].toLowerCase();
        const partialVar = match[2] ? match[2].toLowerCase() : "";

        // We'll filter using the globally cached items,
        // but we also need the raw data to check the "cssAttributesSupported".
        const allVariables = getVariables();

        // Filter items:
        // 1. "cssAttributesSupported" includes the propertyName (ignoring case)
        // 2. The variable name fuzzy-matches partialVar
        const filteredItems = cachedCompletionItems.filter((item) => {
          const originalLabel = item.label.toString(); // e.g. "--color-primary"
          const keyWithoutDashes = originalLabel.replace(/^--/, ""); // "color-primary"

          // Fuzzy match check
          const fuzzyOk = partialVar ? fuzzyMatch(partialVar, keyWithoutDashes) : true;

          // Check if property is supported
          const varData = allVariables[keyWithoutDashes];
          if (!varData) {
            return false;
          }
          const propertySupported = varData.cssAttributesSupported.some(
            (attr) => attr.toLowerCase() === propertyName
          );

          return fuzzyOk && propertySupported;
        });

        // Sort by label
        filteredItems.sort((a, b) => {
          return a.label.toString().localeCompare(b.label.toString());
        });

        return filteredItems;
      },
    },
    "-", " " // Trigger on '-' and ' ' characters
  );
}
