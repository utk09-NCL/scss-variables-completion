// File: src/extension.ts

/**
 * This is the main file that activates the extension.
 * It loads the design tokens (from JSON), sets up commands,
 * registers the SCSS completion provider, and sets up file watchers.
 *
 * The overall architecture is:
 *   - Load design tokens from JSON using functions from json.ts.
 *   - Update the global variable "currentVariables" and the cached completion items.
 *   - Register commands to reload tokens, open the JSON file, and preview tokens.
 *   - Register the completion provider so that as the user types in SCSS files,
 *     relevant tokens are suggested.
 *   - Set up file watchers to reload tokens if the JSON file changes.
 */

import * as vscode from "vscode"; // VS Code API.
import * as path from "path"; // Node.js path module.
import { loadVariablesFromJson } from "./json"; // Import function to load JSON design tokens.
import { IScssVariable } from "./types"; // Import our design token type.
import { updateCompletionItems, registerScssCompletionProvider } from "./completion"; // Import completion functions.

// Global variable to hold the current design tokens (merged from all workspace folders).
let currentVariables: { [key: string]: IScssVariable } = {};

// Create an output channel for logging debug and information messages.
// This output channel can be viewed in VS Code under "View" > "Output" > "SCSS Variables Completion".
const outputChannel = vscode.window.createOutputChannel("SCSS Variables Completion");

/**
 * Loads design tokens (from JSON) from all workspace folders and updates the completion items.
 *
 * @returns A Promise that resolves when tokens are loaded and merged.
 *
 * For each workspace folder, the function attempts to load the JSON file specified in the settings.
 * The tokens from all folders are merged into the global currentVariables object.
 * After merging, the cached completion items are updated.
 */
async function loadAndUpdateAllVariables(): Promise<void> {
  // Clear the current tokens.
  currentVariables = {};

  // Get the list of workspace folders.
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage("SCSS Variables Completion: No workspace folder open.");
    return;
  }

  // Get the JSON file path from the extension's configuration.
  const config = vscode.workspace.getConfiguration("scssVariables");
  const jsonPath = config.get<string>("path", "scssVariables.json");

  // Loop through each workspace folder.
  for (const folder of folders) {
    try {
      // Load tokens from the current folder.
      const folderVars = await loadVariablesFromJson(folder.uri, jsonPath);
      // Merge the tokens into the global currentVariables.
      // If there is a key collision across folders, the token from the last folder wins.
      Object.entries(folderVars).forEach(([key, val]) => {
        currentVariables[key] = val;
      });
    } catch (err: unknown) {
      // If an error occurs (e.g., the user declines to create the file), log the error.
      const error = err instanceof Error ? err : new Error("Unknown error");
      outputChannel.appendLine(`Skipping folder "${folder.name}" due to error: ${error.message}`);
    }
  }

  // Update the cached completion items with the new tokens.
  updateCompletionItems(currentVariables);

  // Notify the user that the tokens have been reloaded.
  vscode.window.showInformationMessage("SCSS Variables Completion: Design tokens reloaded successfully.");
}

/**
 * This function is called when the extension is activated.
 * It loads the design tokens, registers commands and the completion provider,
 * and sets up file watchers to automatically reload tokens on file changes.
 *
 * @param context - The extension context provided by VS Code.
 *
 * The function performs the following steps:
 *   1. Loads design tokens from all workspace folders.
 *   2. Registers commands:
 *      - Reload tokens
 *      - Open the JSON file for editing
 *      - Preview tokens in a WebView
 *   3. Registers the SCSS completion provider.
 *   4. Sets up file watchers for each workspace folder to monitor the JSON file.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Load design tokens upon activation.
  await loadAndUpdateAllVariables();

  // Register a command to reload design tokens manually.
  const reloadCommand = vscode.commands.registerCommand("scss-variables-completion.reload", async () => {
    await loadAndUpdateAllVariables();
  });
  context.subscriptions.push(reloadCommand);

  // Register a command to open the JSON file for editing.
  // For simplicity, this command opens the JSON file from the first workspace folder.
  const openCommand = vscode.commands.registerCommand("scss-variables-completion.open", async () => {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      vscode.window.showErrorMessage("SCSS Variables Completion: No workspace folder open.");
      return;
    }
    const config = vscode.workspace.getConfiguration("scssVariables");
    const jsonPath = config.get<string>("path", "scssVariables.json");
    const firstFolder = folders[0].uri.fsPath;
    const fullPath = path.join(firstFolder, jsonPath);

    try {
      // Open the document at the given path.
      const doc = await vscode.workspace.openTextDocument(fullPath);
      // Show the document in the editor.
      await vscode.window.showTextDocument(doc);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      vscode.window.showErrorMessage(`SCSS Variables Completion: Error opening file: ${error.message}`);
    }
  });
  context.subscriptions.push(openCommand);

  // Register a command to preview all design tokens in a WebView panel.
  // This allows the user to see a table of tokens with their details.
  const previewCommand = vscode.commands.registerCommand("scss-variables-completion.preview", () => {
    const panel = vscode.window.createWebviewPanel(
      "scssVariablesPreview", // Identifies the type of the webview. Used internally.
      "SCSS Variables Preview", // Title of the panel displayed to the user.
      vscode.ViewColumn.One, // Editor column to show the new webview panel in.
      {} // Webview options (none specified here).
    );

    // Build an HTML string that represents a table of all tokens.
    let html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>SCSS Variables Preview</title>
        <style>
          body { font-family: sans-serif; padding: 10px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; }
          th { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <h2>SCSS Variables Preview</h2>
        <p><em>This preview shows all design tokens. Enhancements could include interactive controls for toggling variants.</em></p>
        <table>
          <tr>
            <th>Variable</th>
            <th>Value</th>
            <th>Description</th>
            <th>CSS Attributes Supported</th>
          </tr>
    `;

    // Loop through each token in the global currentVariables and add a row to the table.
    for (const key in currentVariables) {
      const varData = currentVariables[key];
      let valueStr = "";
      if (typeof varData.value === "object") {
        // If the token has multiple variants, list each variant.
        valueStr = Object.entries(varData.value)
          .map(([variant, val]) => `<strong>${variant}:</strong> ${val}`)
          .join("<br/>");
      } else {
        // Otherwise, show the single value.
        valueStr = varData.value;
      }

      html += `
          <tr>
            <td>--${key}</td>
            <td>${valueStr}</td>
            <td>${varData.description || ""}</td>
            <td>${varData.cssAttributesSupported.join(", ")}</td>
          </tr>
      `;
    }

    // Close the HTML tags.
    html += `
        </table>
      </body>
      </html>
    `;

    // Set the HTML content of the webview panel.
    panel.webview.html = html;
  });
  context.subscriptions.push(previewCommand);

  // Register the SCSS completion provider.
  // This provider uses the cached completion items (updated when tokens are loaded).
  const completionProvider = registerScssCompletionProvider(() => currentVariables);
  context.subscriptions.push(completionProvider);

  // Set up file watchers for each workspace folder to automatically reload tokens when the JSON file changes.
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    const config = vscode.workspace.getConfiguration("scssVariables");
    const jsonPath = config.get<string>("path", "scssVariables.json");

    for (const folder of folders) {
      // Construct the URI for the JSON file in this folder.
      const fileUri = vscode.Uri.joinPath(folder.uri, jsonPath);
      // Create a file system watcher for the file.
      const watcher = vscode.workspace.createFileSystemWatcher(fileUri.fsPath);

      // When the file changes, reload the tokens.
      watcher.onDidChange(() => loadAndUpdateAllVariables());
      // When the file is created, reload the tokens.
      watcher.onDidCreate(() => loadAndUpdateAllVariables());
      // When the file is deleted, show an error message.
      watcher.onDidDelete(() => {
        vscode.window.showErrorMessage(
          `SCSS Variables Completion: File "${jsonPath}" was deleted in folder "${folder.name}".`
        );
      });

      // Add the watcher to the subscriptions so it is disposed of when the extension is deactivated.
      context.subscriptions.push(watcher);
    }
  }
}

/**
 * This function is called when the extension is deactivated.
 * It performs any necessary cleanup.
 */
export function deactivate(): void {
  // Dispose of the output channel to free resources.
  outputChannel.dispose();
}
