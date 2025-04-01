// src/jsonValidator.ts
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import Ajv, { ErrorObject } from "ajv";

/**
 * Validates the JSON config file against its schema and shows the result to the user.
 * Provides detailed error messages for any validation failures.
 */
export async function validateJsonFile(): Promise<void> {
  try {
    // Get the extension's settings
    const config = vscode.workspace.getConfiguration("scssVariables");
    // Get the JSON file path from settings, defaulting to "scssVariables.json"
    const jsonPath: string = config.get("path", "scssVariables.json");

    // Get the first workspace folder (assuming single-root workspace for simplicity)
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showWarningMessage(
        "No workspace folder open. Please open a workspace to validate SCSS variables JSON."
      );
      return;
    }

    // Build paths to the JSON file and schema
    const jsonFilePath = path.join(workspaceFolder.uri.fsPath, jsonPath);

    // Get correct extension path using the VS Code API
    const extensionPath = vscode.extensions.getExtension(
      "utk09-NCL.scss-variables-completion"
    )?.extensionPath;
    if (!extensionPath) {
      vscode.window.showErrorMessage(
        "Failed to determine extension path. Please reinstall the extension."
      );
      return;
    }

    const schemaPath = path.join(
      extensionPath,
      "dist",
      "schema",
      "scssVariables.schema.json"
    );

    // Check if files exist
    if (!fs.existsSync(jsonFilePath)) {
      vscode.window.showErrorMessage(
        `JSON file not found at ${jsonFilePath}. Create a JSON file or update the "scssVariables.path" setting.`
      );
      return;
    }

    if (!fs.existsSync(schemaPath)) {
      vscode.window.showErrorMessage(
        `Schema file not found at ${schemaPath}. This is an extension installation issue.`
      );
      return;
    }

    // Read the JSON and schema files
    const jsonContent = fs.readFileSync(jsonFilePath, "utf8");
    const schemaContent = fs.readFileSync(schemaPath, "utf8");

    let jsonData: unknown;
    let schemaData: object;

    try {
      jsonData = JSON.parse(jsonContent);
    } catch (error) {
      const err = error as Error;
      vscode.window.showErrorMessage(
        `Failed to parse JSON file: ${err.message}. Please check for syntax errors.`
      );
      return;
    }

    try {
      schemaData = JSON.parse(schemaContent);
    } catch (error) {
      const err = error as Error;
      vscode.window.showErrorMessage(
        `Failed to parse schema file: ${err.message}. This is an extension installation issue.`
      );
      return;
    }

    // Validate JSON against schema
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(schemaData);
    const valid = validate(jsonData);

    // Create diagnostics collection for showing errors in the Problems panel
    const diagnosticCollection =
      vscode.languages.createDiagnosticCollection("scssJsonValidator");

    if (!valid) {
      // Prepare an array to hold all diagnostics
      const diagnostics: vscode.Diagnostic[] = [];

      // Try to open the document to map errors to positions
      const uri = vscode.Uri.file(jsonFilePath);
      let document: vscode.TextDocument;

      try {
        document = await vscode.workspace.openTextDocument(uri);
      } catch (e) {
        vscode.window.showErrorMessage(
          `Failed to open JSON file for diagnostics: ${e}`
        );
        return;
      }

      // Process each validation error
      if (validate.errors) {
        for (const error of validate.errors) {
          // Format the error message
          let message = `${error.message}`;
          if (error.instancePath) {
            message = `${error.instancePath}: ${message}`;
          }

          // Try to find the position in the document
          const position = findPositionForError(document, error);

          // Create a diagnostic with the appropriate severity and message
          const diagnostic = new vscode.Diagnostic(
            position,
            message,
            vscode.DiagnosticSeverity.Error
          );

          diagnostics.push(diagnostic);
        }
      }

      // Set diagnostics for the URI
      diagnosticCollection.set(uri, diagnostics);

      // Show summary message
      vscode.window.showErrorMessage(
        `JSON validation failed with ${diagnostics.length} errors. See Problems panel for details.`
      );

      // Show the problems panel
      vscode.commands.executeCommand("workbench.actions.view.problems");
    } else {
      // Clear any previous diagnostics
      diagnosticCollection.clear();

      // Show success message
      vscode.window.showInformationMessage(
        "JSON file is valid against schema."
      );
    }
  } catch (error) {
    const err = error as Error;
    vscode.window.showErrorMessage(`Validation failed: ${err.message}`);
  }
}

/**
 * Attempts to find the position in the document for a specific validation error.
 *
 * @param document - The TextDocument containing the JSON
 * @param error - The validation error from Ajv
 * @returns A Range for the error location
 */
function findPositionForError(
  document: vscode.TextDocument,
  error: ErrorObject
): vscode.Range {
  let path = error.instancePath;
  if (path.startsWith("/")) {
    path = path.substring(1);
  }

  const pathParts = path.split("/");

  // Try to find the property in the document
  if (pathParts.length > 0 && pathParts[0] !== "") {
    // For errors in a specific variable
    const text = document.getText();

    // Special handling for different types of errors
    if (error.keyword === "required") {
      // For required property missing - find the object container
      let searchPattern: string;

      if (pathParts.length > 0) {
        // If we're in a nested path, search for the parent object
        const parentPath = pathParts.join("");
        searchPattern = `"${parentPath}"\\s*:\\s*{`;
      } else {
        // If at root, try to find the variable name from the error message
        const missingProperty =
          error.params && "missingProperty" in error.params
            ? (error.params.missingProperty as string)
            : "";
        searchPattern = `"${missingProperty}"`;
      }

      const match = new RegExp(searchPattern).exec(text);
      if (match) {
        const pos = document.positionAt(match.index);
        return new vscode.Range(pos, pos.translate(0, match[0].length));
      }
    } else {
      // For other errors, try to locate the exact property position
      let searchText = "";
      for (let i = 0; i < pathParts.length; i++) {
        if (i === 0) {
          searchText = `"${pathParts[i]}"`;
        } else {
          searchText = `"${pathParts[i - 1]}"[^{]*{[^}]*"${pathParts[i]}"`;
        }
      }

      const regex = new RegExp(searchText);
      const match = regex.exec(text);

      if (match) {
        const pos = document.positionAt(match.index);
        return new vscode.Range(pos, pos.translate(0, match[0].length));
      }
    }
  }

  // Fallback - use first line of the file
  return new vscode.Range(0, 0, 0, 0);
}
