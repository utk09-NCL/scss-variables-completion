// File: src/extension.ts

/**
 * This is the main file that activates the extension.
 * It loads design tokens (from JSON), sets up commands,
 * registers the SCSS completion provider, and sets up file watchers.
 *
 * Overall architecture:
 *   - Load design tokens from JSON using functions from json.ts.
 *   - Update the global variable "currentVariables" with the latest tokens.
 *   - Register commands to reload tokens, open the JSON file, and preview tokens.
 *   - Register the completion provider so that as soon as the user finishes typing the CSS property (after ":"),
 *     relevant tokens are suggested.
 *   - Set up file watchers to reload tokens if the JSON file changes.
 */

import * as vscode from "vscode";
import * as path from "path";
import { loadVariablesFromJson } from "./json";
import { IScssVariable } from "./types";
import { registerScssCompletionProvider } from "./completion";

// Global variable to hold the current design tokens (merged from all workspace folders).
let currentVariables: { [key: string]: IScssVariable } = {};

// Create an output channel for logging messages (viewable under "View" > "Output" > "SCSS Variables Completion").
const outputChannel = vscode.window.createOutputChannel(
  "SCSS Variables Completion"
);

/**
 * Loads design tokens from all workspace folders and updates the global tokens.
 * @returns A Promise that resolves when tokens are loaded and merged.
 *
 * For each workspace folder, this function loads the JSON file (using loadVariablesFromJson)
 * and merges its tokens into currentVariables.
 */
async function loadAndUpdateAllVariables(): Promise<void> {
  // Clear existing tokens.
  currentVariables = {};

  // Retrieve workspace folders.
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage(
      "SCSS Variables Completion: No workspace folder open."
    );
    return;
  }

  // Get the JSON file path from extension settings.
  const config = vscode.workspace.getConfiguration("scssVariables");
  const jsonPath = config.get<string>("path", "scssVariables.json");

  // Loop through each folder.
  for (const folder of folders) {
    try {
      const folderVars = await loadVariablesFromJson(folder.uri, jsonPath);
      // Merge tokens; in case of duplicate keys, the last one wins.
      Object.entries(folderVars).forEach(([key, val]) => {
        currentVariables[key] = val;
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      outputChannel.appendLine(
        `Skipping folder "${folder.name}" due to error: ${error.message}`
      );
    }
  }

  vscode.window.showInformationMessage(
    "SCSS Variables Completion: Design tokens reloaded successfully."
  );
}

/**
 * Activates the extension.
 * @param context - The extension context provided by VS Code.
 *
 * The function performs the following:
 *   1. Loads design tokens.
 *   2. Registers commands: reload, open JSON, preview tokens.
 *   3. Registers the SCSS completion provider (using our updated provider).
 *   4. Sets up file watchers to reload tokens if the JSON file changes.
 */
export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  // Load tokens on activation.
  await loadAndUpdateAllVariables();

  // Register command to reload tokens.
  const reloadCommand = vscode.commands.registerCommand(
    "scss-variables-completion.reload",
    async () => {
      await loadAndUpdateAllVariables();
    }
  );
  context.subscriptions.push(reloadCommand);

  // Register command to open the JSON file for editing (using the first workspace folder).
  const openCommand = vscode.commands.registerCommand(
    "scss-variables-completion.open",
    async () => {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) {
        vscode.window.showErrorMessage(
          "SCSS Variables Completion: No workspace folder open."
        );
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
        vscode.window.showErrorMessage(
          `SCSS Variables Completion: Error opening file: ${error.message}`
        );
      }
    }
  );
  context.subscriptions.push(openCommand);

  // Register command to preview all tokens in a WebView.
  const previewCommand = vscode.commands.registerCommand(
    "scss-variables-completion.preview",
    () => {
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
          th { background-color: #f2f2f2; cursor: pointer; }
          th.sort-asc::after { content: " ▲"; }
          th.sort-desc::after { content: " ▼"; }
        </style>
      </head>
      <body>
        <h2>SCSS Variables Preview</h2>
        <p><em>This preview shows all design tokens.</em></p>
        <table id="variables-table">
          <thead>
            <tr>
              <th onclick="sortTable(0)">Variable</th>
              <th onclick="sortTable(1)">Value</th>
              <th onclick="sortTable(2)">Description</th>
              <th onclick="sortTable(3)">CSS Attributes Supported</th>
            </tr>
          </thead>
          <tbody>
    `;

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
          </tbody>
        </table>
        <script>
          // Attach sortTable to the global window object so that inline onclick handlers can access it.
          window.sortTable = function(columnIndex) {
            const table = document.getElementById("variables-table");
            const tbody = table.tBodies[0];
            const rowsArray = Array.from(tbody.getElementsByTagName("tr"));
            const headerCells = table.tHead.getElementsByTagName("th");

            let currentDirection = headerCells[columnIndex].classList.contains("sort-asc") ? "asc" :
                                   headerCells[columnIndex].classList.contains("sort-desc") ? "desc" : "asc";

            // Clear sort indicators.
            Array.from(headerCells).forEach(th => th.classList.remove("sort-asc", "sort-desc"));

            if (currentDirection === "asc") {
              currentDirection = "desc";
              headerCells[columnIndex].classList.add("sort-desc");
            } else {
              currentDirection = "asc";
              headerCells[columnIndex].classList.add("sort-asc");
            }

            // Sort rows using textContent.
            rowsArray.sort((a, b) => {
              const cellA = a.getElementsByTagName("td")[columnIndex].textContent.toLowerCase();
              const cellB = b.getElementsByTagName("td")[columnIndex].textContent.toLowerCase();
              if (cellA < cellB) return currentDirection === "asc" ? -1 : 1;
              if (cellA > cellB) return currentDirection === "asc" ? 1 : -1;
              return 0;
            });

            rowsArray.forEach(row => tbody.appendChild(row));
          }
        </script>
      </body>
      </html>
    `;

      panel.webview.html = html;
    }
  );
  context.subscriptions.push(previewCommand);

  // Register the SCSS completion provider (using the updated function).
  const completionProvider = registerScssCompletionProvider(
    () => currentVariables
  );
  context.subscriptions.push(completionProvider);

  // Set up file watchers for each workspace folder to reload tokens when the JSON file changes.
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
 * Called when the extension is deactivated.
 * Cleans up by disposing the output channel.
 */
export function deactivate(): void {
  outputChannel.dispose();
}
