// src/jsonValidator.ts
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import Ajv from "ajv";

/**
 * Validates the JSON config file against its schema and shows the result to the user.
 */
export async function validateJsonFile(): Promise<void> {
  // Get the extension’s settings.
  const config = vscode.workspace.getConfiguration("scssVariables");
  // Get the JSON file path from settings, defaulting to "scssVariables.json".
  const jsonPath: string = config.get("path", "scssVariables.json");
  // Get the first workspace folder (assuming a single-root workspace).
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    // Warn if no workspace is open.
    vscode.window.showWarningMessage("No workspace folder found");
    return;
  }

  // Build the full path to the JSON file.
  const fullPath = path.join(workspaceFolder.uri.fsPath, jsonPath);
  try {
    // Read the JSON file as a string.
    const rawData = await fs.promises.readFile(fullPath, "utf8");
    // Parse the JSON into an object.
    const jsonData = JSON.parse(rawData);

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
    // Read the schema file.
    const schemaRaw = await fs.promises.readFile(schemaPath, "utf8");
    // Parse the schema into an object.
    const schema = JSON.parse(schemaRaw);

    // Create an AJV instance to validate JSON against the schema.
    const ajv = new Ajv();
    const validate = ajv.compile(schema); // Compile the schema for validation.
    const valid = validate(jsonData); // Check if the JSON matches the schema.

    if (!valid) {
      // If validation fails, format and show all errors.
      const errors = validate.errors
        ?.map((err) => `${err.instancePath || "/"} ${err.message}`)
        .join("\n");
      vscode.window.showErrorMessage(
        `JSON validation errors in ${fullPath}:\n${errors}`
      );
    } else {
      // If valid, notify the user.
      vscode.window.showInformationMessage(
        `JSON file at ${fullPath} is valid!`
      );
    }
  } catch (err) {
    // Handle file read or parsing errors with a helpful message.
    const errorMsg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(
      `Error reading or validating JSON file at ${fullPath}: ${errorMsg}. Ensure the file exists and is valid JSON.`
    );
  }
}
