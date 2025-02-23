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
import { registerHoverProvider } from "./hoverProvider";

// Global variable to maintain the scanner instance across the extension.
let deepScanner: DeepScanner;

/**
 * Main entry point for the extension, called when VS Code activates it.
 * Sets up completions, diagnostics, hovering, scanning, commands, and file watchers.
 *
 * @param context - VS Code’s extension context for managing subscriptions and lifecycle.
 */
export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  // Create an output channel for logging.
  const outputChannel = vscode.window.createOutputChannel("SCSS Variables");
  // Create a logger with the output channel.
  const logger = createLogger(outputChannel);
  logger.info("Extension activation started"); // Log the start.

  try {
    // Load SCSS variables from the JSON file first.
    logger.info("Loading SCSS variables");
    const { variablesMap, cssAttributeMap } = await loadScssVariables();

    // Initialize the deep scanner before using it in providers.
    logger.info("Initializing deep scanner");
    deepScanner = new DeepScanner(1000, logger);
    await deepScanner.scanWorkspace(); // Perform an initial scan.
    context.subscriptions.push(deepScanner); // Add to subscriptions for cleanup.

    // Register the completion provider after deepScanner is ready.
    logger.info("Registering completion provider");
    context.subscriptions.push(
      registerScssCompletionProvider(variablesMap, () =>
        deepScanner.getLocalDefinitions()
      )
    );

    // Register diagnostics for variable usage validation.
    logger.info("Registering diagnostics");
    context.subscriptions.push(registerDiagnostics(variablesMap));

    // Register the hover provider after deepScanner is ready.
    logger.info("Registering hover provider");
    context.subscriptions.push(
      registerHoverProvider(variablesMap, () =>
        deepScanner.getLocalDefinitions()
      )
    );

    // Command: Refresh variables and rescan the workspace.
    logger.info("Registering refresh command");
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "scssVariables.refresh",
        async (): Promise<void> => {
          logger.info("Refresh command executed");
          const result = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: "Reloading SCSS variables from JSON",
              cancellable: false,
            },
            async () => await loadScssVariables()
          );
          variablesMap.clear();
          for (const [key, value] of result.variablesMap) {
            variablesMap.set(key, value);
          }
          cssAttributeMap.clear();
          for (const [key, set] of result.cssAttributeMap) {
            cssAttributeMap.set(key, set);
          }
          await deepScanner.scanWorkspace();
          vscode.window.showInformationMessage(
            "SCSS variables refreshed and deep scan completed"
          );
        }
      )
    );

    // Command: Open the JSON config file.
    logger.info("Registering openConfig command");
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "scssVariables.openConfig",
        async (): Promise<void> => {
          logger.info("Open config command executed");
          const config = getConfig();
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

    // Command: Show an overview of all variables.
    logger.info("Registering showOverview command");
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "scssVariables.showOverview",
        async (): Promise<void> => {
          logger.info("Show overview command executed");
          showOverviewPanel(variablesMap, deepScanner);
        }
      )
    );

    // Command: Validate the JSON file against its schema.
    logger.info("Registering validateJson command");
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "scssVariables.validateJson",
        async (): Promise<void> => {
          logger.info("Validate JSON command executed");
          await validateJsonFile();
        }
      )
    );

    // Command: Check for unused JSON variables.
    logger.info("Registering checkUnused command");
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "scssVariables.checkUnused",
        async (): Promise<void> => {
          logger.info("Check unused command executed");
          await checkUnusedJsonVariables(variablesMap);
        }
      )
    );

    // Set up a watcher for JSON file changes.
    logger.info("Setting up JSON file watcher");
    const watcher = vscode.workspace.createFileSystemWatcher(
      "**/scssVariables.json"
    );
    watcher.onDidChange(async () => {
      logger.info("JSON file changed, reloading");
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Reloading SCSS variables from JSON",
          cancellable: false,
        },
        async () => await loadScssVariables()
      );
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

    logger.info("Extension activation completed successfully");
  } catch (err) {
    logger.error("Extension activation failed", err);
    vscode.window.showErrorMessage(
      `SCSS Variables extension failed to activate: ${err}`
    );
  }
}

/**
 * Called when the extension is deactivated (e.g., VS Code closes).
 * Cleanup is handled by VS Code via subscriptions.
 */
export function deactivate(): void {
  // No manual cleanup needed; subscriptions handle it.
}
