// src/extension.ts
import * as vscode from "vscode";
import { loadScssVariables, ScssVariable, CssAttributeMap } from "./jsonLoader";
import { registerDiagnostics } from "./diagnostics";
import { DeepScanner, LocalDefinition } from "./deepScanner";
import { registerCompletionProvider } from "./completionProvider";
import { registerHoverProvider } from "./hoverProvider";
import { ScssVariablesCodeActionProvider } from "./codeActionProvider";
import { validateJsonFile } from "./jsonValidator";
import { checkUnusedJsonVariables } from "./checkUnused";
import { OverviewPanel } from "./overviewPanel";
import {
  createLogger,
  getJsonPath,
  Logger,
  getDebounceInterval,
} from "./config";

// Global state for the extension
let variablesMap: Map<string, ScssVariable> = new Map();
// This map stores CSS attributes to variable name mapping for fast lookups
// It's assigned in refreshVariables but used in other modules
// @ts-ignore - This is used by other modules and in future enhancements
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let cssAttributeMap: CssAttributeMap = new Map();
let localVariables: LocalDefinition[] = [];
let outputChannel: vscode.OutputChannel;
let logger: Logger;
let scanner: DeepScanner;

// Create a typed event system for notifying about refreshed variables
export interface RefreshEvent {
  variablesMap: Map<string, ScssVariable>;
  localVariables: LocalDefinition[];
}

// Event emitter for variable refreshes
const refreshEventEmitter = new vscode.EventEmitter<RefreshEvent>();
export const onVariablesRefreshed = refreshEventEmitter.event;

/**
 * Activates the extension when a relevant file is opened.
 * Sets up all providers and initializes variables.
 *
 * @param context - The extension context provided by VS Code
 */
export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  // Create output channel for logging
  outputChannel = vscode.window.createOutputChannel("SCSS Variables - utk09");
  logger = createLogger(outputChannel);

  logger.info("SCSS Variables extension activated");

  // Create the deep scanner
  scanner = new DeepScanner(getDebounceInterval(1000), logger, context);

  // Register the refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand("scssVariables.refresh", async () => {
      await refreshVariables();
      vscode.window.showInformationMessage("SCSS variables refreshed");
    })
  );

  // Register the open config command
  context.subscriptions.push(
    vscode.commands.registerCommand("scssVariables.openConfig", async () => {
      await openJsonConfig();
    })
  );

  // Register the show overview command
  context.subscriptions.push(
    vscode.commands.registerCommand("scssVariables.showOverview", () => {
      OverviewPanel.createOrShow(
        variablesMap,
        localVariables,
        context.extensionUri
      );
    })
  );

  // Register the validate JSON command
  context.subscriptions.push(
    vscode.commands.registerCommand("scssVariables.validateJson", async () => {
      await validateJsonFile();
    })
  );

  // Register the check unused command
  context.subscriptions.push(
    vscode.commands.registerCommand("scssVariables.checkUnused", async () => {
      await checkUnusedJsonVariables(variablesMap);
    })
  );

  // Initial load of variables
  await refreshVariables();

  // Register the providers
  const completionDisposable = registerCompletionProvider(
    variablesMap,
    localVariables
  );

  const hoverDisposable = registerHoverProvider(variablesMap, localVariables);

  const diagnosticsDisposable = registerDiagnostics(variablesMap);

  // Register the code action provider
  const codeActionProvider = vscode.languages.registerCodeActionsProvider(
    [{ language: "scss" }, { language: "css" }],
    new ScssVariablesCodeActionProvider(variablesMap),
    {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }
  );

  // Add all disposables to context
  context.subscriptions.push(
    completionDisposable,
    hoverDisposable,
    diagnosticsDisposable,
    codeActionProvider,
    outputChannel,
    scanner
  );

  logger.info("All providers registered");
}

/**
 * Refreshes all variables from JSON and workspace scan.
 */
export async function refreshVariables(): Promise<void> {
  logger.info("Refreshing variables...");

  try {
    // Load variables from JSON
    const result = await loadScssVariables();
    variablesMap = result.variablesMap;

    // We're assigning this but not directly using it in extension.ts
    // It's provided to other modules as needed
    cssAttributeMap = result.cssAttributeMap;

    logger.info(`Loaded ${variablesMap.size} variables from JSON`);

    // Scan workspace for local variables
    await scanner.scanWorkspace();
    localVariables = scanner.getLocalDefinitions();

    logger.info(`Found ${localVariables.length} local variables in workspace`);

    // Emit refresh event for subscribers (like the completion provider)
    refreshEventEmitter.fire({
      variablesMap,
      localVariables,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Error refreshing variables: ${errorMsg}`);
    vscode.window.showErrorMessage(
      `Failed to refresh SCSS variables: ${errorMsg}`
    );
  }
}

/**
 * Opens the SCSS variables JSON config file.
 */
export async function openJsonConfig(): Promise<void> {
  try {
    const jsonPath = getJsonPath();
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
      vscode.window.showWarningMessage(
        "No workspace folder open. Please open a workspace to edit the JSON file."
      );
      return;
    }

    // Try to find the JSON file in any workspace folder
    for (const folder of workspaceFolders) {
      const fullPath = vscode.Uri.joinPath(folder.uri, jsonPath);

      try {
        await vscode.workspace.fs.stat(fullPath);
        // File exists, open it
        const document = await vscode.workspace.openTextDocument(fullPath);
        await vscode.window.showTextDocument(document);
        return;
      } catch (err) {
        // File doesn't exist in this folder, try the next one
        // eslint-disable-next-line no-console
        console.error(
          `File not found in ${folder.name}: ${err}. Trying next folder...`
        );
        continue;
      }
    }

    // If we get here, the file wasn't found in any workspace folder
    const result = await vscode.window.showWarningMessage(
      `SCSS variables file "${jsonPath}" not found. Would you like to create it?`,
      "Yes",
      "No"
    );

    if (result === "Yes") {
      await createJsonFile(jsonPath);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Error opening config file: ${errorMsg}`);
    vscode.window.showErrorMessage(
      `Failed to open SCSS variables config: ${errorMsg}`
    );
  }
}

/**
 * Creates a new JSON config file with a template.
 *
 * @param jsonPath - The path where the file should be created
 */
async function createJsonFile(jsonPath: string): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return;
  }

  // Template for new JSON file
  const template = {
    "example-background-color": {
      value: {
        light: "#ffffff",
        dark: "#1e1e1e",
      },
      description: "Example background color variable",
      cssAttributesSupported: ["background-color"],
    },
    "example-text-color": {
      value: {
        light: "#000000",
        dark: "#ffffff",
      },
      description: "Example text color variable",
      cssAttributesSupported: ["color"],
    },
  };

  // Create the file
  const fullPath = vscode.Uri.joinPath(workspaceFolder.uri, jsonPath);
  const content = JSON.stringify(template, null, 2);

  await vscode.workspace.fs.writeFile(fullPath, Buffer.from(content, "utf8"));

  // Open the new file
  const document = await vscode.workspace.openTextDocument(fullPath);
  await vscode.window.showTextDocument(document);

  logger.info(`Created new SCSS variables file at ${fullPath.fsPath}`);
}

/**
 * Called when the extension is deactivated.
 * Handles cleanup.
 */
export function deactivate(): void {
  logger.info("SCSS Variables extension deactivated");
}
