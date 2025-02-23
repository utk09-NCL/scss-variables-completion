// src/extension.ts
import * as vscode from "vscode";
import { loadScssVariables } from "./jsonLoader";
import { registerScssCompletionProvider } from "./completionProvider";
import { registerDiagnostics } from "./diagnostics";
import { createLogger, getConfig } from "./config";
import { DeepScanner } from "./deepScanner";
import { showOverviewPanel } from "./overviewPanel";
import { validateJsonFile } from "./jsonValidator";
import { checkUnusedJsonVariables } from "./checkUnused";

// Keep the scanner available across the extension.
let deepScanner: DeepScanner;

/**
 * Starts the extension when VS Code activates it (e.g., when opening a .scss file).
 * Sets up completions, warnings, scanning, and commands.
 *
 * @param context - VS Code’s tools for managing the extension.
 */
export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  // Set up a place to show logs in VS Code.
  const outputChannel = vscode.window.createOutputChannel("SCSS Variables");
  const logger = createLogger(outputChannel); // Create a logger for tracking.

  // Load the JSON variables into memory.
  const { variablesMap, cssAttributeMap } = await loadScssVariables();

  // Add the completion provider for suggesting variables.
  context.subscriptions.push(
    registerScssCompletionProvider(variablesMap, () =>
      deepScanner.getLocalDefinitions()
    )
  );

  // Add warnings for variable misuse.
  context.subscriptions.push(registerDiagnostics(variablesMap));

  // Start scanning for local definitions with a 1-second delay between scans.
  deepScanner = new DeepScanner(1000, logger);
  await deepScanner.scanWorkspace(); // Do an initial scan.
  context.subscriptions.push(deepScanner); // Clean up when extension stops.

  // Add a command to refresh variables and rescan.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      // Register the command.
      "scssVariables.refresh",
      async (): Promise<void> => {
        // Reload variables from JSON.
        const result = await loadScssVariables();
        variablesMap.clear(); // Clear old data.
        for (const [key, value] of result.variablesMap) {
          variablesMap.set(key, value); // Update with new data.
        }
        cssAttributeMap.clear();
        for (const [key, set] of result.cssAttributeMap) {
          cssAttributeMap.set(key, set);
        }
        await deepScanner.scanWorkspace(); // Rescan the workspace.
        // Tell the user it’s done.
        vscode.window.showInformationMessage(
          "SCSS variables refreshed and deep scan completed"
        );
      }
    )
  );

  // Add a command to open the JSON config file.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "scssVariables.openConfig",
      async (): Promise<void> => {
        const config = getConfig();
        const jsonPath: string = config.get("configPath", "scssVariables.json");
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
          const uri = vscode.Uri.joinPath(workspaceFolder.uri, jsonPath); // Build the file path.
          try {
            const doc = await vscode.workspace.openTextDocument(uri); // Open the file.
            await vscode.window.showTextDocument(doc); // Show it to the user.
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

  // Add a command to show an overview of variables.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "scssVariables.showOverview",
      async (): Promise<void> => {
        showOverviewPanel(variablesMap, deepScanner); // Show the panel.
      }
    )
  );

  // Add a command to validate the JSON file.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "scssVariables.validateJson",
      async (): Promise<void> => {
        await validateJsonFile(); // Check the JSON against its schema.
      }
    )
  );

  // Add a command to check for unused variables.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "scssVariables.checkUnused",
      async (): Promise<void> => {
        await checkUnusedJsonVariables(variablesMap); // Look for unused JSON variables.
      }
    )
  );

  // Watch the JSON file for changes and reload if it updates.
  const watcher = vscode.workspace.createFileSystemWatcher(
    "**/scssVariables.json"
  );
  watcher.onDidChange(async () => {
    const result = await loadScssVariables(); // Reload variables.
    variablesMap.clear(); // Clear old data.
    for (const [key, value] of result.variablesMap) {
      variablesMap.set(key, value);
    }
    cssAttributeMap.clear();
    for (const [key, set] of result.cssAttributeMap) {
      cssAttributeMap.set(key, set);
    }
  });
  context.subscriptions.push(watcher); // Clean up the watcher later.
}

/** Runs when the extension stops; VS Code handles cleanup. */
export function deactivate(): void {
  // No manual cleanup needed; subscriptions handle it.
}
