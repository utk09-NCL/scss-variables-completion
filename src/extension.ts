// File: src/extension.ts

import * as vscode from "vscode";
import * as path from "path";
import { loadVariablesFromJson } from "./json";
import { IScssVariable } from "./types";
import { updateCompletionItems, registerScssCompletionProvider } from "./completion";

let currentVariables: { [key: string]: IScssVariable } = {};

// Create an output channel for logging
const outputChannel = vscode.window.createOutputChannel("SCSS Variables Completion");

/**
 * Loads design tokens from all workspace folders, merges them,
 * and updates the completion items. If a folder is missing the JSON file
 * and the user declines to create it, we skip that folder.
 */
async function loadAndUpdateAllVariables(): Promise<void> {
  currentVariables = {};

  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage("SCSS Variables Completion: No workspace folder open.");
    return;
  }

  const config = vscode.workspace.getConfiguration("scssVariables");
  const jsonPath = config.get<string>("path", "scssVariables.json");

  // For each folder, attempt to load variables
  for (const folder of folders) {
    try {
      const folderVars = await loadVariablesFromJson(folder.uri, jsonPath);
      // Merge into currentVariables
      // If there's a key collision across folders, last one wins
      Object.entries(folderVars).forEach(([key, val]) => {
        currentVariables[key] = val;
      });
    } catch (err: unknown) {
      // If the user said "No" or some other error:
      const error = err instanceof Error ? err : new Error("Unknown error");
      outputChannel.appendLine(`Skipping folder "${folder.name}" due to error: ${error.message}`);
    }
  }

  updateCompletionItems(currentVariables);

  // Let the user know (if there is more than one folder, we might be merging)
  vscode.window.showInformationMessage("SCSS Variables Completion: Design tokens reloaded successfully.");
}

/**
 * Activates the extension.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Attempt to load design tokens on activation
  await loadAndUpdateAllVariables();

  // Register a command to reload design tokens
  const reloadCommand = vscode.commands.registerCommand("scss-variables-completion.reload", async () => {
    await loadAndUpdateAllVariables();
  });
  context.subscriptions.push(reloadCommand);

  // Register a command to open the JSON file for editing (just from the *first* folder for simplicity)
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
      const doc = await vscode.workspace.openTextDocument(fullPath);
      await vscode.window.showTextDocument(doc);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      vscode.window.showErrorMessage(`SCSS Variables Completion: Error opening file: ${error.message}`);
    }
  });
  context.subscriptions.push(openCommand);

  // Register a command to preview all design tokens in a WebView
  const previewCommand = vscode.commands.registerCommand("scss-variables-completion.preview", () => {
    const panel = vscode.window.createWebviewPanel(
      "scssVariablesPreview",
      "SCSS Variables Preview",
      vscode.ViewColumn.One,
      {}
    );

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
        <p><em>This preview is a simple table. "Enhancing" it could mean adding interactive controls
        for toggling light/dark variants, or applying font sizes dynamically to demonstrate usage.</em></p>
        <table>
          <tr>
            <th>Variable</th>
            <th>Value</th>
            <th>Description</th>
            <th>CSS Attributes Supported</th>
          </tr>
    `;

    // Print out the design tokens
    for (const key in currentVariables) {
      const varData = currentVariables[key];
      let valueStr = "";
      if (typeof varData.value === "object") {
        valueStr = Object.entries(varData.value)
          .map(([variant, val]) => `<strong>${variant}:</strong> ${val}`)
          .join("<br/>");
      } else {
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

    html += `
        </table>
      </body>
      </html>
    `;

    panel.webview.html = html;
  });
  context.subscriptions.push(previewCommand);

  // Register the SCSS completion provider
  const completionProvider = registerScssCompletionProvider(() => currentVariables);
  context.subscriptions.push(completionProvider);

  // Create file watchers for each folder so that changes reload the tokens
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    const config = vscode.workspace.getConfiguration("scssVariables");
    const jsonPath = config.get<string>("path", "scssVariables.json");

    for (const folder of folders) {
      const fileUri = vscode.Uri.joinPath(folder.uri, jsonPath);
      const watcher = vscode.workspace.createFileSystemWatcher(fileUri.fsPath);

      watcher.onDidChange(() => loadAndUpdateAllVariables());
      watcher.onDidCreate(() => loadAndUpdateAllVariables());
      watcher.onDidDelete(() => {
        vscode.window.showErrorMessage(
          `SCSS Variables Completion: File "${jsonPath}" was deleted in folder "${folder.name}".`
        );
      });

      context.subscriptions.push(watcher);
    }
  }
}

/**
 * Deactivates the extension.
 */
export function deactivate(): void {
  // No special cleanup needed
  outputChannel.dispose();
}
