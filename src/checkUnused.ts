// src/checkUnused.ts
import * as vscode from "vscode";
import { ScssVariable } from "./jsonLoader";

/**
 * Checks for unused SCSS variables defined in the JSON file by scanning the workspace.
 * Shows warnings in VS Code for variables that aren't used in any SCSS/CSS files.
 *
 * @param variablesMap - A map of variable names (keys) to their SCSS variable details (values).
 * @returns A promise that resolves when the check is complete.
 */
export async function checkUnusedJsonVariables(
  variablesMap: Map<string, ScssVariable>
): Promise<void> {
  // Get all variable names from the JSON map as an array.
  const jsonVariables = Array.from(variablesMap.keys());

  // Create an object to track how many times each variable is used.
  const usageCount: Record<string, number> = {};
  // Initialize each variable's usage count to 0.
  jsonVariables.forEach((key) => (usageCount[key] = 0));

  // Find all SCSS and CSS files in the workspace.
  const files = await vscode.workspace.findFiles("**/*.{scss,css}");

  // Loop through each file to check for variable usage.
  for (const file of files) {
    // Open the file's content as a text document.
    const document = await vscode.workspace.openTextDocument(file);
    // Get the full text of the file.
    const text = document.getText();

    // Check each variable to see if it appears in the file.
    jsonVariables.forEach((varName) => {
      // Create a regex to match "var(--variableName)" in the text.
      const regex = new RegExp(`var\\(\\s*--${varName}\\s*\\)`, "g");
      // If the regex finds a match, increment the usage count.
      if (regex.test(text)) {
        usageCount[varName] += 1;
      }
    });
  }

  // Now, open the JSON file and set up warnings for unused variables.
  const config = vscode.workspace.getConfiguration("scssVariables");
  // Get the path to the JSON file from settings (default: "scssVariables.json").
  const jsonPath: string = config.get("configPath", "scssVariables.json");
  // Get the root folder of the workspace.
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  // If no workspace is open, stop here.
  if (!workspaceFolder) {
    return;
  }
  // Build the full path to the JSON file.
  const jsonUri = vscode.Uri.joinPath(workspaceFolder.uri, jsonPath);

  // Array to hold warning messages (diagnostics).
  const diagnostics: vscode.Diagnostic[] = [];
  // Check each variable's usage count.
  Object.keys(usageCount).forEach((varName) => {
    // If the variable was never used (count is 0), add a warning.
    if (usageCount[varName] === 0) {
      // Define a range for the warning (start of file, since it's JSON-wide).
      const range = new vscode.Range(
        new vscode.Position(0, 0),
        new vscode.Position(0, 0)
      );
      // Create a warning message for the unused variable.
      diagnostics.push(
        new vscode.Diagnostic(
          range,
          `SCSS variable "--${varName}" is defined in JSON but not used anywhere in the workspace.`,
          vscode.DiagnosticSeverity.Warning
        )
      );
    }
  });

  // Create a collection to display the warnings in VS Code.
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection("scssJsonUnused");
  // Attach the warnings to the JSON file.
  diagnosticCollection.set(jsonUri, diagnostics);
  // Show a popup to let the user know the check is done.
  vscode.window.showInformationMessage(
    "Unused JSON variables diagnostics updated."
  );
}
