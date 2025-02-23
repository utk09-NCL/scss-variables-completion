// src/overviewPanel.ts
import * as vscode from "vscode";
import { DeepScanner, LocalDefinition } from "./deepScanner";
import { ScssVariable } from "./jsonLoader";

/**
 * Displays a webview panel listing all JSON-defined and local SCSS variables.
 * Highlights local variables not in JSON and adds a "Jump to Definition" button for JSON vars.
 *
 * @param jsonVariables - Map of variables defined in the JSON file.
 * @param deepScanner - Scanner instance with local definitions from the workspace.
 */
export function showOverviewPanel(
  jsonVariables: Map<string, ScssVariable>,
  deepScanner: DeepScanner
): void {
  // Create a new webview panel in VS Code.
  const panel = vscode.window.createWebviewPanel(
    "scssVariablesOverview", // Internal ID for the panel.
    "SCSS Variables Overview", // Title shown to the user.
    vscode.ViewColumn.One, // Display in the first editor column.
    { enableScripts: true } // Allow JavaScript in the webview.
  );

  // Get all local definitions from the scanner.
  const localDefs = deepScanner.getLocalDefinitions();
  // Create a set of JSON variable names for quick lookup.
  const jsonVarNames = new Set(jsonVariables.keys());

  // Build the HTML content for the panel.
  let html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <style>
      table { width: 100%; border-collapse: collapse; } /* Make tables full-width and tidy */
      th, td { padding: 8px; border: 1px solid #ddd; text-align: left; } /* Style table cells */
      tr:hover { background-color:rgb(145, 145, 145); cursor: pointer; } /* Highlight rows on hover */
      .missing { background-color: #ffe6e6; } /* Light red for local vars not in JSON */
      button { padding: 4px 8px; cursor: pointer; } /* Style the jump button */
    </style>
  </head>
  <body>
    <h2>Design System Variables [Design System]</h2>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Description</th>
          <th>Value</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
  `;

  // Add each JSON variable as a row with a jump button.
  jsonVariables.forEach((variable, key) => {
    html += `
      <tr onclick="openJsonVariable('${key}')">
        <td>[Design System] ${key}</td>
        <td>${variable.description}</td>
        <td><pre>${JSON.stringify(variable.value, null, 2)}</pre></td>
        <td><button onclick="event.stopPropagation(); openJsonVariable('${key}')">Jump to Definition</button></td>
      </tr>`;
  });

  // Finish the JSON table and start the local definitions table.
  html += `
      </tbody>
    </table>
    <h2>Local Definitions [Local]</h2>
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

  // Add each local definition, highlighting ones not in JSON.
  localDefs.forEach((def: LocalDefinition) => {
    const isMissing = !jsonVarNames.has(def.name); // Check if it’s missing from JSON.
    html += `
      <tr class="${
        isMissing ? "missing" : ""
      }" onclick="openLocalFile('${def.fileUri.toString()}', ${def.line})">
        <td>[Local] ${def.name}</td>
        <td>${def.kind}</td>
        <td>${def.fileUri.fsPath}</td>
        <td>${def.line + 1}</td>
      </tr>`;
  });

  // Add the JavaScript for interactivity.
  html += `
      </tbody>
    </table>
    <script>
      const vscode = acquireVsCodeApi(); // Connect to VS Code from the webview.
      /** Opens a local file at the specified line when clicked. */
      function openLocalFile(uri, line) {
        vscode.postMessage({ command: "openFile", uri: uri, line: line });
      }
      /** Opens the JSON file and highlights the variable when clicked. */
      function openJsonVariable(varName) {
        vscode.postMessage({ command: "openJsonVariable", varName: varName });
      }
    </script>
  </body>
  </html>
  `;

  // Set the panel’s content.
  panel.webview.html = html;

  // Handle messages from the webview (click events).
  panel.webview.onDidReceiveMessage((message) => {
    if (message.command === "openFile") {
      // Open a local file and scroll to the specified line.
      const uri = vscode.Uri.parse(message.uri);
      vscode.workspace.openTextDocument(uri).then((doc) => {
        vscode.window.showTextDocument(doc).then((editor) => {
          const pos = new vscode.Position(message.line, 0);
          editor.revealRange(new vscode.Range(pos, pos));
        });
      });
    } else if (message.command === "openJsonVariable") {
      // Open the JSON file and highlight the variable.
      vscode.commands.executeCommand("scssVariables.openConfig").then(() => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
          const text = activeEditor.document.getText();
          const regex = new RegExp(`"${message.varName}"\\s*:`);
          const match = regex.exec(text);
          if (match) {
            const pos = activeEditor.document.positionAt(match.index);
            activeEditor.revealRange(new vscode.Range(pos, pos));
            activeEditor.selection = new vscode.Selection(pos, pos); // Select the variable.
          }
        }
      });
    }
  });
}
