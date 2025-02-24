// src/hoverProvider.ts
import * as vscode from "vscode";
import { ScssVariable } from "./jsonLoader";
import { LocalDefinition } from "./deepScanner";

/**
 * Registers a hover provider to show detailed information when hovering over SCSS variables.
 * Displays description, value, and source (JSON or local file), with clickable links for local definitions.
 * Ensures links are rendered correctly in VS Code’s hover UI.
 *
 * @param variablesMap - A map of SCSS variable names (keys) to their definitions from JSON (values).
 * @param getLocalDefinitions - A function that returns an array of local SCSS definitions found in the workspace.
 * @returns A disposable object to clean up the hover provider when the extension stops.
 */
export function registerHoverProvider(
  variablesMap: Map<string, ScssVariable>,
  getLocalDefinitions: () => LocalDefinition[]
): vscode.Disposable {
  return vscode.languages.registerHoverProvider(
    [{ language: "scss" }, { language: "css" }],
    {
      /**
       * Provides hover information when the user hovers over code.
       * @param document - The file being hovered over.
       * @param position - The cursor position in the file.
       * @returns A hover object with info to display, or undefined if no info applies.
       */
      provideHover(
        document: vscode.TextDocument,
        position: vscode.Position
      ): vscode.Hover | undefined {
        // Find the range of a variable name like "--my-var" at the cursor position.
        const range = document.getWordRangeAtPosition(position, /--[\w-]+/);
        if (!range) {
          return undefined;
        } // No variable found under the cursor.

        // Extract the variable name by removing the "--" prefix.
        const varName = document.getText(range).substring(2);
        // Create a Markdown string to format the hover info nicely.
        const markdown = new vscode.MarkdownString();

        // Check if the variable is defined in the JSON file (design system).
        if (variablesMap.has(varName)) {
          const variable = variablesMap.get(varName)!; // Get the variable’s details.
          // Add a bold header for the variable.
          markdown.appendMarkdown(
            `**Design System Variable: --${varName}**\n\n`
          );
          // Show the description from the JSON.
          markdown.appendMarkdown(
            `**Description:** ${variable.description}\n\n`
          );
          // Display the value object (e.g., light/dark themes) in a code block.
          markdown.appendMarkdown(
            `**Value:**\n\`\`\`css\n${JSON.stringify(
              variable.value,
              null,
              2
            )}\n\`\`\`\n\n`
          );
          // Indicate the source as the design system JSON.
          markdown.appendMarkdown(`**Source:** Design System (JSON)`);
          // Return the hover info with the range it applies to.
          return new vscode.Hover(markdown, range);
        }

        // Check if the variable is defined locally in the workspace.
        const localDefs = getLocalDefinitions().filter(
          (def) => def.name === varName
        );
        if (localDefs.length > 0) {
          // Loop through all local definitions (there could be multiple with the same name).
          localDefs.forEach((def, index) => {
            // Add a header for each definition, numbered if there’s more than one.
            markdown.appendMarkdown(
              `**Local Definition ${index + 1}: --${varName}**\n\n`
            );
            // Show the type (variable, mixin, or function).
            markdown.appendMarkdown(`**Kind:** ${def.kind}\n\n`);
            // If there’s a value (e.g., "#6c757d"), display it in a code block.
            if (def.value) {
              markdown.appendMarkdown(
                `**Value:** \`\`\`css\n${def.value}\n\`\`\`\n\n`
              );
            }
            // Create a clickable link to jump to the definition file and line.
            // Use a simpler Markdown link format that VS Code understands.
            const uri = vscode.Uri.parse(def.fileUri.toString()).with({
              fragment: `L${def.line + 1}`,
            });
            // Format the link as a Markdown URL, ensuring it’s clickable in VS Code.
            markdown.appendMarkdown(
              `**Defined in:** [${def.fileUri.fsPath}:${
                def.line + 1
              }](${uri})\n\n`
            );
          });
          // Ensure the Markdown string supports clickable links in VS Code.
          markdown.supportHtml = true; // Enable HTML support for links.
          // Return the hover info for all local definitions.
          return new vscode.Hover(markdown, range);
        }

        // If no JSON or local definition is found, don’t show a hover.
        return undefined;
      },
    }
  );
}
