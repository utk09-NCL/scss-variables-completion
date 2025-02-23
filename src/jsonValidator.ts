// src/jsonValidator.ts
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import Ajv from "ajv";

/** Validates the JSON file against its schema and shows the result. */
export async function validateJsonFile(): Promise<void> {
  const config = vscode.workspace.getConfiguration("scssVariables");
  const jsonPath: string = config.get("configPath", "scssVariables.json"); // Get JSON path.
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]; // Get the workspace.
  if (!workspaceFolder) {
    vscode.window.showWarningMessage("No workspace folder found"); // Need a workspace.
    return;
  }
  const fullPath = path.join(workspaceFolder.uri.fsPath, jsonPath); // Full file path.
  try {
    const rawData = await fs.promises.readFile(fullPath, "utf8"); // Read the JSON.
    const jsonData = JSON.parse(rawData); // Parse it.
    // Find the schema file in the extension’s folder.
    const extPath =
      vscode.extensions.getExtension("utk09-ncl.scss-variables-completion")
        ?.extensionPath || __dirname;
    // The schema file is in the "dist/schema" folder.
    const schemaPath = path.join(
      extPath,
      "dist",
      "schema",
      "scssVariables.schema.json"
    );
    const schemaRaw = await fs.promises.readFile(schemaPath, "utf8"); // Read the schema.
    const schema = JSON.parse(schemaRaw); // Parse it.
    const ajv = new Ajv(); // JSON schema validator.
    const validate = ajv.compile(schema); // Prepare the validator.
    const valid = validate(jsonData); // Check the JSON.
    if (!valid) {
      // If it fails, show all errors.
      const errors = validate.errors
        ?.map((err) => `${err.instancePath} ${err.message}`)
        .join("\n");
      vscode.window.showErrorMessage(`JSON validation errors:\n${errors}`);
    } else {
      // If it passes, say so.
      vscode.window.showInformationMessage("JSON file is valid!");
    }
  } catch (err) {
    vscode.window.showErrorMessage(
      `Error reading or validating JSON file: ${err}`
    );
  }
}
