// File: src/json.ts

/**
 * This module handles loading the design tokens from a JSON file.
 * It also prompts the user to create a default JSON file if none exists.
 * The design tokens are the "source of truth" for our SCSS variable completions.
 */

import * as vscode from "vscode"; // VS Code API for interacting with the editor.
import { ICustomError, IScssVariable } from "./types"; // Import our custom types.

// A default JSON string that provides sample design tokens.
// This content is used if the JSON file does not exist and the user agrees to create one.
const defaultVariablesContent = `{
  "color-primary": {
    "value": { "light": "#ff0000", "dark": "#00ff00" },
    "description": "Primary color",
    "cssAttributesSupported": ["color", "background-color"]
  },
  "color-secondary": {
    "value": { "light": "#ff0000", "dark": "#00ff00" },
    "description": "Secondary color",
    "cssAttributesSupported": ["color", "background-color"]
  },
  "some-var": {
    "value": { "small": "12px", "medium": "16px", "large": "20px" },
    "description": "Font size",
    "cssAttributesSupported": ["font-size"]
  },
  "some-other-var": {
    "value": "Arial, sans-serif",
    "description": "Font family",
    "cssAttributesSupported": ["font-family", "font"]
  }
}
`;

/**
 * Loads design tokens from a JSON file located at the specified relative path in a given folder.
 *
 * @param folderUri - The URI of the workspace folder where the JSON file should be found.
 * @param relativePath - The relative path to the JSON file (e.g., "scssVariables.json").
 *
 * @returns A Promise that resolves to an object mapping token names to IScssVariable objects.
 *
 * If the file does not exist, the user is prompted to create it using the default content.
 * If the user declines or if there is any parsing error, the promise is rejected with an Error.
 */
export async function loadVariablesFromJson(
  folderUri: vscode.Uri,
  relativePath: string
): Promise<{ [key: string]: IScssVariable }> {
  // Construct the full URI to the JSON file.
  const fileUri = vscode.Uri.joinPath(folderUri, relativePath);

  try {
    // Attempt to read the file from disk.
    const fileData = await vscode.workspace.fs.readFile(fileUri);
    // Convert the file data (a Uint8Array) to a UTF-8 string.
    const fileStr = Buffer.from(fileData).toString("utf8");
    try {
      // Parse the JSON string into an object.
      const json = JSON.parse(fileStr);
      return json;
    } catch (e) {
      // If parsing fails, throw an error with a detailed message.
      throw new Error(`Error parsing JSON in "${relativePath}": ${e}`);
    }
  } catch (err: unknown) {
    // If reading the file fails, check if the error indicates the file was not found.
    if (err instanceof Error && ((err as ICustomError).code === "FileNotFound" || (err as ICustomError).code === "ENOENT")) {
      // Prompt the user with a warning message asking whether to create the file.
      const choice = await vscode.window.showWarningMessage(
        `File "${relativePath}" not found in folder "${folderUri.fsPath}". Do you want to create it?`,
        "Yes",
        "No"
      );
      if (choice === "Yes") {
        // Create the file with default content.
        const defaultBuffer = Buffer.from(defaultVariablesContent, "utf8");
        await vscode.workspace.fs.writeFile(fileUri, defaultBuffer);
        vscode.window.showInformationMessage(
          `File "${relativePath}" created with default content. Please update it with your design tokens.`
        );

        // After creating, read the file back.
        const newFileData = await vscode.workspace.fs.readFile(fileUri);
        const newFileStr = Buffer.from(newFileData).toString("utf8");
        try {
          const json = JSON.parse(newFileStr);
          return json;
        } catch (parseErr) {
          throw new Error(`Error parsing newly created JSON: ${parseErr}`);
        }
      } else {
        // If the user declines to create the file, throw an error.
        throw new Error(`File "${relativePath}" is required but was not created.`);
      }
    } else {
      // For other types of errors, rethrow them.
      throw err;
    }
  }
}
