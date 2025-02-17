import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

interface IScssVariable {
  value: string;
  description?: string;
}

// Holds the variables loaded from the JSON file.
let variables: { [key: string]: IScssVariable } = {};
// Cache of completion items built from the variables.
let cachedCompletionItems: vscode.CompletionItem[] = [];

// Create output channel
const outputChannel = vscode.window.createOutputChannel(
  "SCSS Variables Completion"
);

// Default JSON content for new file
const defaultVariablesContent = JSON.stringify(
  {
    "color-primary": {
      value: "#ff0000",
      description: "Primary color"
    }
  },
  null,
  2
);

/**
 * Updates the cached completion items based on the current variables.
 */
function updateCachedCompletions(): void {
  cachedCompletionItems = Object.entries(variables).map(([key, varData]) => {
    const item = new vscode.CompletionItem(
      `--${key}`,
      vscode.CompletionItemKind.Variable
    );
    // Insert as a snippet: var(--variable-name)
    item.insertText = new vscode.SnippetString(`var(--${key})`);
    let details = `**Value:** ${varData.value}`;
    if (varData.description) {
      details += `\n\n${varData.description}`;
    }
    item.documentation = new vscode.MarkdownString(details);
    return item;
  });
}

/**
 * Loads the SCSS variables from the JSON file.
 *
 * Expected JSON format:
 * {
 *   "border-radius-large": {
 *     "value": "8px",
 *     "description": "#fff on dark mode, #1a1a1a on light mode"
 *   },
 *   "color-primary": {
 *     "value": "#ff0000",
 *     "description": "Primary color"
 *   }
 * }
 */
function loadVariables(): void {
  const config = vscode.workspace.getConfiguration("scssVariables");
  const filePath = config.get<string>("path", "scssVariables.json");

  if (
    !vscode.workspace.workspaceFolders ||
    vscode.workspace.workspaceFolders.length === 0
  ) {
    vscode.window.showErrorMessage(
      "SCSS Variables Completion: No workspace folder open."
    );
    return;
  }

  const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const fullPath = path.join(workspaceFolder, filePath);

  fs.readFile(fullPath, "utf8", (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        // File not found: prompt user to create one.
        vscode.window
          .showWarningMessage(
            `SCSS Variables Completion: "${filePath}" not found. Please create a ${filePath} file in the root of your project or update the "scssVariables.path" setting. Do you want to create ${filePath} in the root directory?`,
            "Yes",
            "No"
          )
          .then((selection) => {
            if (selection === "Yes") {
              // Create a default JSON file with sample content.
              fs.writeFile(fullPath, defaultVariablesContent, "utf8", (writeErr) => {
                if (writeErr) {
                  vscode.window.showErrorMessage(
                    `SCSS Variables Completion: Error creating "${filePath}": ${writeErr.message}`
                  );
                  return;
                }
                vscode.window.showInformationMessage(
                  `SCSS Variables Completion: "${filePath}" created successfully. Please update it with your variables.`
                );
                // After creating the file, attempt to load variables again.
                loadVariables();
              });
            } else {
              vscode.window.showErrorMessage(
                `SCSS Variables Completion: "${filePath}" is required. Please create the file or update your settings.`
              );
            }
          });
      } else {
        vscode.window.showErrorMessage(
          `SCSS Variables Completion: Error reading "${filePath}": ${err.message}`
        );
        variables = {};
        updateCachedCompletions();
      }
      return;
    }
    try {
      const json = JSON.parse(data);
      variables = json;
      updateCachedCompletions();
      vscode.window.showInformationMessage(
        "SCSS Variables Completion: Variables reloaded successfully."
      );
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(
        `SCSS Variables Completion: Error parsing "${filePath}": ${errorMessage}`
      );
      variables = {};
      updateCachedCompletions();
    }
  });
}

/**
 * Opens the variables JSON file in an editor.
 */
async function openVariablesFile(): Promise<void> {
  const config = vscode.workspace.getConfiguration("scssVariables");
  const filePath = config.get<string>("path", "scssVariables.json");

  if (
    !vscode.workspace.workspaceFolders ||
    vscode.workspace.workspaceFolders.length === 0
  ) {
    const message = "SCSS Variables Completion: No workspace folder open.";
    vscode.window.showErrorMessage(message);
    outputChannel.appendLine(message);
    return;
  }

  const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const fullPath = path.join(workspaceFolder, filePath);

  try {
    const doc = await vscode.workspace.openTextDocument(fullPath);
    await vscode.window.showTextDocument(doc);
  } catch (err) {
    const message = `SCSS Variables Completion: Unable to open file: ${err}`;
    vscode.window.showErrorMessage(message);
    outputChannel.appendLine(message);
  }
}

/**
 * Activate the extension.
 */
export function activate(context: vscode.ExtensionContext): void {
  // Load variables on startup.
  loadVariables();

  const config = vscode.workspace.getConfiguration("scssVariables");
  const filePath = config.get<string>("path", "scssVariables.json");

  // Watch the JSON file for changes.
  if (
    vscode.workspace.workspaceFolders &&
    vscode.workspace.workspaceFolders.length > 0
  ) {
    const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const fullPath = path.join(workspaceFolder, filePath);

    const fileWatcher = vscode.workspace.createFileSystemWatcher(fullPath);
    fileWatcher.onDidChange(() => loadVariables());
    fileWatcher.onDidCreate(() => loadVariables());
    fileWatcher.onDidDelete(() => {
      variables = {};
      updateCachedCompletions();
      const message = `SCSS Variables Completion: File "${filePath}" was deleted.`;
      vscode.window.showErrorMessage(message);
      outputChannel.appendLine(message);
    });
    context.subscriptions.push(fileWatcher);
  }

  // Register a CompletionItemProvider for .scss and .module.scss files.
  const provider = vscode.languages.registerCompletionItemProvider(
    ["scss", "module.scss"],
    {
      provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
      ) {
        // Get the text before the cursor.
        const linePrefix = document
          .lineAt(position)
          .text.substring(0, position.character);
        // Regex to capture the variable filter after "var(--"
        const regex = /var\(--?([\w\s-]*)$/;
        const match = regex.exec(linePrefix);
        const filter = match ? match[1] : "";

        // Split the filter into tokens for enhanced filtering.
        const filterTokens = filter
          .trim()
          .split(/\s+/)
          .filter((token) => token.length > 0)
          .map((token) => token.toLowerCase());

        // Return only completion items whose key contains every token.
        const filteredItems = cachedCompletionItems.filter((item) => {
          const key = item.label.toString().replace(/^--/, "").toLowerCase();
          return filterTokens.every((token) => key.includes(token));
        });
        return filteredItems;
      },
    },
    "-",
    " " // Trigger on '-' and space characters.
  );
  context.subscriptions.push(provider);

  // Register command: Reload Variables JSON manually.
  const reloadCommand = vscode.commands.registerCommand(
    "scss-variables-completion.reload",
    () => {
      loadVariables();
    }
  );
  context.subscriptions.push(reloadCommand);

  // Register command: Open Variables JSON for editing.
  const openCommand = vscode.commands.registerCommand(
    "scss-variables-completion.open",
    () => {
      openVariablesFile();
    }
  );
  context.subscriptions.push(openCommand);
}

/**
 * Deactivate the extension.
 */
export function deactivate(): void {
  outputChannel.dispose();
}
