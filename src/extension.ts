// src/extension.ts
import * as vscode from "vscode";
import { loadScssVariables } from "./jsonLoader";
import { registerScssCompletionProvider } from "./completionProvider";
import { registerDiagnostics } from "./diagnostics";

/**
 * Activates the extension by registering completion providers, diagnostics, and commands.
 *
 * @param context The extension context provided by VS Code.
 * @returns A promise that resolves when the activation is complete.
 */
export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  // Load SCSS variables from the JSON file.
  const { variablesMap, cssAttributeMap } = await loadScssVariables();

  // Register the completion provider for SCSS and CSS files.
  context.subscriptions.push(
    registerScssCompletionProvider(variablesMap, cssAttributeMap)
  );

  // Register diagnostics for SCSS variable usage.
  context.subscriptions.push(registerDiagnostics(variablesMap));

  // Command: Reload SCSS variables from the JSON file.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "scssVariables.reload",
      async (): Promise<void> => {
        const result = await loadScssVariables();
        // Clear and update the existing maps so that providers see the latest data.
        variablesMap.clear();
        for (const [key, value] of result.variablesMap) {
          variablesMap.set(key, value);
        }
        cssAttributeMap.clear();
        for (const [key, set] of result.cssAttributeMap) {
          cssAttributeMap.set(key, set);
        }
        vscode.window.showInformationMessage("SCSS variables reloaded");
      }
    )
  );

  // Command: Open the JSON file in the editor.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "scssVariables.openJson",
      async (): Promise<void> => {
        const config = vscode.workspace.getConfiguration("scssVariables");
        const jsonPath: string = config.get("path", "scssVariables.json");

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
          const uri = vscode.Uri.joinPath(workspaceFolder.uri, jsonPath);
          try {
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);
          } catch (err) {
            const errorMessage =
              err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(
              `Failed to open ${jsonPath}: ${errorMessage}`
            );
          }
        }
      }
    )
  );

  // Watch for changes to the JSON file and update the in-memory maps accordingly.
  const watcher = vscode.workspace.createFileSystemWatcher(
    "**/scssVariables.json"
  );
  watcher.onDidChange(async () => {
    const result = await loadScssVariables();
    variablesMap.clear();
    for (const [key, value] of result.variablesMap) {
      variablesMap.set(key, value);
    }
    cssAttributeMap.clear();
    for (const [key, set] of result.cssAttributeMap) {
      cssAttributeMap.set(key, set);
    }
  });
  context.subscriptions.push(watcher);
}

/**
 * Deactivates the extension.
 */
export function deactivate(): void {
  // Cleanup is handled by VS Code via context.subscriptions.
}
