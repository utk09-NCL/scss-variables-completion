// src/overviewPanel.ts
import * as vscode from "vscode";
import { DeepScanner, LocalDefinition } from "./deepScanner";
import { ScssVariable } from "./jsonLoader";

/**
 * Shows a web panel with a table of all JSON and local SCSS variables.
 *
 * @param jsonVariables - Map of JSON-defined variables.
 * @param deepScanner - Scanner with local definitions.
 */
export function showOverviewPanel(
  jsonVariables: Map<string, ScssVariable>,
  deepScanner: DeepScanner
): void {
  // Create a new webview panel in VS Code.
  const panel = vscode.window.createWebviewPanel(
    "scssVariablesOverview", // Internal ID.
    "SCSS Variables Overview", // Title shown to user.
    vscode.ViewColumn.One, // Where to show it.
    { enableScripts: true } // Allow JavaScript in the panel.
  );

  const localDefs = deepScanner.getLocalDefinitions(); // Get all local definitions.

  // Start building the HTML content for the panel.
  let html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <style>
      table { width: 100%; border-collapse: collapse; } /* Make tables full-width and neat */
      th, td { padding: 8px; border: 1px solid #ddd; text-align: left; } /* Style cells */
      tr:hover { background-color:rgb(169, 169, 169); cursor: pointer; } /* Highlight rows on hover */
    </style>
  </head>
  <body>
    <h2>JSON Defined Variables [JSON]</h2>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Description</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
  `;
  // Add each JSON variable as a clickable row.
  jsonVariables.forEach((variable, key) => {
    html += `<tr onclick="openJsonVariable('${key}')">
        <td>[JSON] ${key}</td>
        <td>${variable.description}</td>
        <td><pre>${JSON.stringify(variable.value, null, 2)}</pre></td>
    </tr>`;
  });
  html += `
      </tbody>
    </table>
    <h2>Local Definitions [LOCAL]</h2>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Kind</th>
          <th>File</th>
          <th>Line</th>
        </tr>
      </thead>
      <tbody>
  `;
  // Add each local definition as a clickable row.
  localDefs.forEach((def: LocalDefinition) => {
    html += `<tr onclick="openLocalFile('${def.fileUri.toString()}', ${
      def.line
    })">
        <td>[LOCAL] ${def.name}</td>
        <td>${def.kind}</td>
        <td>${def.fileUri.fsPath}</td>
        <td>${def.line + 1}</td>
    </tr>`;
  });
  html += `
      </tbody>
    </table>
    <script>
      const vscode = acquireVsCodeApi(); // Connect to VS Code from the webview.
      function openLocalFile(uri, line) {
          vscode.postMessage({ command: 'openFile', uri: uri, line: line }); // Tell VS Code to open a file.
      }
      function openJsonVariable(varName) {
          vscode.postMessage({ command: 'openJsonVariable', varName: varName }); // Open JSON variable.
      }
    </script>
  </body>
  </html>
  `;
  panel.webview.html = html; // Set the panel’s content.

  // Handle clicks in the panel.
  panel.webview.onDidReceiveMessage((message) => {
    if (message.command === "openFile") {
      const uri = vscode.Uri.parse(message.uri); // Convert string to URI.
      // Open the file and scroll to the line.
      vscode.workspace.openTextDocument(uri).then((doc) => {
        vscode.window.showTextDocument(doc).then((editor) => {
          const pos = new vscode.Position(message.line, 0);
          editor.revealRange(new vscode.Range(pos, pos));
        });
      });
    } else if (message.command === "openJsonVariable") {
      // Open the JSON file and try to find the variable.
      vscode.commands.executeCommand("scssVariables.openConfig").then(() => {
        // After opening the JSON file, attempt to locate the variable.
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
          const text = activeEditor.document.getText();
          const regex = new RegExp(`"(${message.varName})":`); // Look for the variable name.
          const match = regex.exec(text);
          if (match) {
            const pos = activeEditor.document.positionAt(match.index); // Go to its position.
            activeEditor.revealRange(new vscode.Range(pos, pos));
            activeEditor.selection = new vscode.Selection(pos, pos); // Highlight it.
          }
        }
      });
    }
  });
}
