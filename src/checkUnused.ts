// src/checkUnused.ts
import * as vscode from "vscode";
import { ScssVariable } from "./jsonLoader";

/**
 * Checks for SCSS variables defined in the JSON file that aren’t used in the workspace.
 * Shows warnings in the Problems panel at the exact location of each unused variable in the JSON file.
 *
 * @param variablesMap - A map of variable names (keys) to their SCSS variable details (values).
 * @returns A promise that resolves when the check is complete.
 */
export async function checkUnusedJsonVariables(
  variablesMap: Map<string, ScssVariable>
): Promise<void> {
  // Get all variable names from the JSON as an array.
  const jsonVariables = Array.from(variablesMap.keys());

  // Create an object to count how many times each variable is used.
  const usageCount: Record<string, number> = {};
  // Set each variable’s count to 0 initially.
  jsonVariables.forEach((key) => (usageCount[key] = 0));

  // Find all SCSS and CSS files in the workspace to check.
  const files = await vscode.workspace.findFiles("**/*.{scss,css}");

  // Loop through each file to look for variable usage.
  for (const file of files) {
    // Open the file as a text document.
    const document = await vscode.workspace.openTextDocument(file);
    // Get all the text in the file.
    const text = document.getText();
    // Check each JSON variable to see if it’s used.
    jsonVariables.forEach((varName) => {
      // Use a regex to find "var(--variableName)" in the text.
      const regex = new RegExp(`var\\(\\s*--${varName}\\s*\\)`, "g");
      if (regex.test(text)) {
        usageCount[varName] += 1; // Increment if found.
      }
    });
  }

  // Get the path to the JSON file from the extension’s settings.
  const config = vscode.workspace.getConfiguration("scssVariables");
  const jsonPath: string = config.get("path", "scssVariables.json");
  // Get the first workspace folder (assuming a single-root workspace).
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    // Stop if there’s no workspace open.
    return;
  }

  // Build the full URI to the JSON file.
  const jsonUri = vscode.Uri.joinPath(workspaceFolder.uri, jsonPath);
  // Open the JSON file to find exact positions of variables.
  const jsonDoc = await vscode.workspace.openTextDocument(jsonUri);
  const jsonText = jsonDoc.getText();
  // Array to hold warning messages (diagnostics).
  const diagnostics: vscode.Diagnostic[] = [];

  // Check each variable’s usage count.
  Object.keys(usageCount).forEach((varName) => {
    if (usageCount[varName] === 0) {
      // If not used anywhere.
      // Find where this variable is defined in the JSON text.
      const regex = new RegExp(`"${varName}"\\s*:`);
      const match = regex.exec(jsonText);
      let range = new vscode.Range(0, 0, 0, 0); // Default to start of file.
      if (match) {
        // Calculate the exact position of the variable name.
        const startPos = jsonDoc.positionAt(match.index);
        const endPos = jsonDoc.positionAt(match.index + match[0].length);
        range = new vscode.Range(startPos, endPos); // Set the range to the variable name.
      }
      // Add a warning about the unused variable.
      diagnostics.push(
        new vscode.Diagnostic(
          range,
          `SCSS variable "--${varName}" is defined in JSON but not used anywhere in the workspace.`,
          vscode.DiagnosticSeverity.Warning
        )
      );
    }
  });

  // Create a collection to show these warnings in VS Code.
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection("scssJsonUnused");
  // Attach the warnings to the JSON file’s URI.
  diagnosticCollection.set(jsonUri, diagnostics);
  // Notify the user that the check is complete.
  vscode.window.showInformationMessage(
    "Unused JSON variables diagnostics updated."
  );
}
