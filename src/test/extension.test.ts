import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

suite("SCSS Variables Completion Extension Test Suite", () => {
  const testVariables = {
    "color-primary": {
      value: "#ff0000",
      description: "Primary color",
    },
    "spacing-large": {
      value: "24px",
    },
  };

  let workspaceFolder: string;

  suiteSetup(async () => {
    // Wait for extension to activate
    await vscode.extensions
      .getExtension("utk09-NCL.scss-variables-completion")
      ?.activate();

    if (vscode.workspace.workspaceFolders) {
      workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
      // Create test variables file
      const varsPath = path.join(workspaceFolder, "scssVariables.json");
      fs.writeFileSync(varsPath, JSON.stringify(testVariables, null, 2));
    }
  });

  test("Extension should be present", () => {
    assert.ok(
      vscode.extensions.getExtension("utk09-NCL.scss-variables-completion")
    );
  });

  test("Should provide completions", async () => {
    if (!workspaceFolder) {
      // eslint-disable-next-line no-console
      console.warn("Skipping test: No workspace folder found.");
      return;
    }

    // Create a test SCSS file
    const testFile = path.join(workspaceFolder, "test.scss");
    const content = "body { color: var(--) }";

    const uri = vscode.Uri.file(testFile);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content));

    await vscode.workspace.openTextDocument(uri);
    const position = new vscode.Position(0, 17); // Position after var(--

    const completions =
      await vscode.commands.executeCommand<vscode.CompletionList>(
        "vscode.executeCompletionItemProvider",
        uri,
        position
      );

    assert.ok(completions?.items.length >= 2);
    assert.ok(
      completions?.items.some((item) => item.label === "--color-primary")
    );
    assert.ok(
      completions?.items.some((item) => item.label === "--spacing-large")
    );
  });

  test("Should filter completions", async () => {
    if (!workspaceFolder) {
      // eslint-disable-next-line no-console
      console.warn("Skipping test: No workspace folder found.");
      return;
    }

    const testFile = path.join(workspaceFolder, "test.scss");
    const content = "body { color: var(--color) }";

    const uri = vscode.Uri.file(testFile);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content));

    await vscode.workspace.openTextDocument(uri);
    const position = new vscode.Position(0, 22);

    const completions =
      await vscode.commands.executeCommand<vscode.CompletionList>(
        "vscode.executeCompletionItemProvider",
        uri,
        position
      );

    assert.strictEqual(completions?.items.length, 1);
    assert.strictEqual(completions?.items[0].label, "--color-primary");
  });
});