// File: src/json.ts

import * as vscode from "vscode";
import { ICustomError, IScssVariable } from "./types";

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
 * Loads variables from a JSON file in the given folder.
 * If the file doesn't exist, prompt the user to create it with default content.
 * If the user chooses "No," rejects the promise.
 */
export async function loadVariablesFromJson(
  folderUri: vscode.Uri,
  relativePath: string
): Promise<{ [key: string]: IScssVariable }> {
  const fileUri = vscode.Uri.joinPath(folderUri, relativePath);

  try {
    // Attempt to read the file
    const fileData = await vscode.workspace.fs.readFile(fileUri);
    const fileStr = Buffer.from(fileData).toString("utf8");
    try {
      const json = JSON.parse(fileStr);
      return json;
    } catch (e) {
      throw new Error(`Error parsing JSON in "${relativePath}": ${e}`);
    }
  } catch (err: unknown) {
    // Check if file not found
    if (err instanceof Error && (err as ICustomError).code === "FileNotFound" || (err as ICustomError).code === "ENOENT") {
      const choice = await vscode.window.showWarningMessage(
        `File "${relativePath}" not found in folder "${folderUri.fsPath}". Do you want to create it?`,
        "Yes",
        "No"
      );
      if (choice === "Yes") {
        // Create the file with default content
        const defaultBuffer = Buffer.from(defaultVariablesContent, "utf8");
        await vscode.workspace.fs.writeFile(fileUri, defaultBuffer);
        vscode.window.showInformationMessage(
          `File "${relativePath}" created with default content. Please update it with your design tokens.`
        );

        // Read it back
        const newFileData = await vscode.workspace.fs.readFile(fileUri);
        const newFileStr = Buffer.from(newFileData).toString("utf8");
        try {
          const json = JSON.parse(newFileStr);
          return json;
        } catch (parseErr) {
          throw new Error(`Error parsing newly created JSON: ${parseErr}`);
        }
      } else {
        throw new Error(`File "${relativePath}" is required but was not created.`);
      }
    } else {
      throw err;
    }
  }
}
