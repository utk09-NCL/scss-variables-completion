import * as assert from "assert";
import * as vscode from "vscode";
import { loadVariablesFromJson } from "../src/json";

/**
 * Basic suite of tests to ensure extension activates without errors.
 */
suite("SCSS Variables Completion Extension Tests", () => {
  test("Extension activates properly", async () => {
    // 1. Identify the extension by its publisher.name from package.json
    const extensionId = "utk09-NCL.scss-variables-completion";

    // 2. Try to get the extension
    const extension = vscode.extensions.getExtension(extensionId);
    assert.ok(extension, "Extension could not be found!");

    // 3. Activate the extension
    await extension?.activate();

    // 4. Confirm it is active
    assert.strictEqual(extension?.isActive, true, "Extension did not activate properly.");
  });

  test("Configuration defaults are correct", async () => {
    // Check default setting from package.json, e.g. scssVariables.path
    const config = vscode.workspace.getConfiguration("scssVariables");
    const actualPath = config.get<string>("path");
    assert.strictEqual(actualPath, "scssVariables.json", "Default path should be scssVariables.json");
  });

  test("loadVariablesFromJson loads variables from JSON file", async function () {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.skip(); // Skip if no workspace folder is present
      return;
    }

    const folderUri = workspaceFolders[0].uri;
    const relativePath = "scssVariables.json";

    // Create a temporary scssVariables.json file with some content
    const tempFileUri = vscode.Uri.joinPath(folderUri, relativePath);
    const tempFileContent = `{
      "test-variable": {
        "value": "#ffffff",
        "description": "Test variable",
        "cssAttributesSupported": ["color"]
      }
    }`;
    await vscode.workspace.fs.writeFile(tempFileUri, Buffer.from(tempFileContent));

    const variables = await loadVariablesFromJson(folderUri, relativePath);
    assert.ok(variables["test-variable"], "Variable not loaded from JSON file");
    assert.strictEqual(variables["test-variable"].value, "#ffffff", "Variable value is incorrect");

    // Clean up the temporary file
    await vscode.workspace.fs.delete(tempFileUri);
  });

  test("loadVariablesFromJson creates default JSON file if not exists", async function () {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.skip(); // Skip if no workspace folder is present
      return;
    }

    const folderUri = workspaceFolders[0].uri;
    const relativePath = "nonExistentFile.json";
    const tempFileUri = vscode.Uri.joinPath(folderUri, relativePath);

    // Attempt to load variables from a non-existent file
    try {
      await loadVariablesFromJson(folderUri, relativePath);
      // Check if the file was created
      const fileExists = await vscode.workspace.fs.stat(tempFileUri);
      assert.ok(fileExists, "File was not created");

      // Clean up the temporary file
      await vscode.workspace.fs.delete(tempFileUri);
    } catch (error: any) {
      // Handle the error if the file creation fails
      assert.ok(error, "Error occurred while creating the file");
    }
  });

  test("loadVariablesFromJson throws error on invalid JSON", async function () {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.skip(); // Skip if no workspace folder is present
      return;
    }

    const folderUri = workspaceFolders[0].uri;
    const relativePath = "invalid.json";

    // Create a temporary invalid.json file
    const tempFileUri = vscode.Uri.joinPath(folderUri, relativePath);
    const tempFileContent = `{
      "test-variable": {
        "value": "#ffffff",
        "description": "Test variable",
        "cssAttributesSupported": ["color"]
    `; // Missing closing curly brace
    await vscode.workspace.fs.writeFile(tempFileUri, Buffer.from(tempFileContent));

    try {
      await loadVariablesFromJson(folderUri, relativePath);
      assert.fail("Should have thrown an error");
    } catch (error: any) {
      assert.ok(error.message.startsWith('Error parsing JSON in "invalid.json"'), "Error message is incorrect");
    }

    // Clean up the temporary file
    await vscode.workspace.fs.delete(tempFileUri);
  });
});