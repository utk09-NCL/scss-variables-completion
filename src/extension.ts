import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

interface IScssVariable {
  value: string;
  description?: string;
  category?: string;
}

// Holds the variables loaded from the data source.
let variables: { [key: string]: IScssVariable } = {};
// Cache of completion items built from the variables.
let cachedCompletionItems: vscode.CompletionItem[] = [];

// Create an output channel for debug logging.
const outputChannel = vscode.window.createOutputChannel("SCSS Variables Completion");

// Default JSON content when creating a new file.
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
 * A simple fuzzy match: returns true if every character in the pattern appears
 * (in order) in the text.
 */
function fuzzyMatch(pattern: string, text: string): boolean {
  let pIndex = 0;
  let tIndex = 0;
  pattern = pattern.toLowerCase();
  text = text.toLowerCase();
  while (pIndex < pattern.length && tIndex < text.length) {
    if (pattern[pIndex] === text[tIndex]) {
      pIndex++;
    }
    tIndex++;
  }
  return pIndex === pattern.length;
}

/**
 * Updates the cached completion items from the variables.
 */
function updateCachedCompletions(): void {
  cachedCompletionItems = Object.entries(variables).map(([key, varData]) => {
    const item = new vscode.CompletionItem(
      `--${key}`,
      vscode.CompletionItemKind.Variable
    );
    // When inserted, the snippet becomes: var(--variable-name)
    item.insertText = new vscode.SnippetString(`var(--${key})`);
    let details = `**Value:** ${varData.value}`;
    if (varData.description) {
      details += `\n\n${varData.description}`;
    }
    if (varData.category) {
      details += `\n\n**Category:** ${varData.category}`;
    }
    item.documentation = new vscode.MarkdownString(details);
    return item;
  });
}

/**
 * Parses a SCSS file to extract CSS custom properties.
 * Expects declarations in the form: --variable: value;
 */
function parseScssFile(filePath: string): Promise<{ [key: string]: string }> {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) {
        return reject(err);
      }
      const vars: { [key: string]: string } = {};
      // Regex to match CSS custom properties.
      const regex = /--([\w-]+)\s*:\s*([^;]+);/g;
      let match;
      while ((match = regex.exec(data)) !== null) {
        const varName = match[1];
        const varValue = match[2].trim();
        vars[varName] = varValue;
      }
      resolve(vars);
    });
  });
}

/**
 * Loads variables from the configured data source.
 * If "scssVariables.source" is "json", it reads from a JSON file.
 * If set to "scss", it reads from two SCSS files (dark and light themes) and merges them.
 */
function loadVariables(): void {
  const config = vscode.workspace.getConfiguration("scssVariables");
  const source = config.get<string>("source", "json");

  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    const message = "SCSS Variables Completion: No workspace folder open.";
    vscode.window.showErrorMessage(message);
    outputChannel.appendLine(message);
    return;
  }
  const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;

  if (source === "json") {
    const filePath = config.get<string>("path", "scssVariables.json");
    const fullPath = path.join(workspaceFolder, filePath);
    fs.readFile(fullPath, "utf8", (err, data) => {
      if (err) {
        if (err.code === "ENOENT") {
          vscode.window
            .showWarningMessage(
              `SCSS Variables Completion: "${filePath}" not found. Please create a ${filePath} file in the root of your project or update the "scssVariables.path" setting. Do you want to create ${filePath} in the root directory?`,
              "Yes",
              "No"
            )
            .then((selection) => {
              if (selection === "Yes") {
                fs.writeFile(fullPath, defaultVariablesContent, "utf8", (writeErr) => {
                  if (writeErr) {
                    const msg = `Error creating "${filePath}": ${writeErr.message}`;
                    vscode.window.showErrorMessage(`SCSS Variables Completion: ${msg}`);
                    outputChannel.appendLine(msg);
                    return;
                  }
                  vscode.window.showInformationMessage(
                    `SCSS Variables Completion: "${filePath}" created successfully. Please update it with your variables.`
                  );
                  outputChannel.appendLine(`File created: ${filePath}`);
                  loadVariables();
                });
              } else {
                const msg = `"${filePath}" is required. Please create the file or update your settings.`;
                vscode.window.showErrorMessage(`SCSS Variables Completion: ${msg}`);
                outputChannel.appendLine(msg);
              }
            });
        } else {
          const msg = `Error reading "${filePath}": ${err.message}`;
          vscode.window.showErrorMessage(`SCSS Variables Completion: ${msg}`);
          outputChannel.appendLine(msg);
          variables = {};
          updateCachedCompletions();
        }
        return;
      }
      try {
        const json = JSON.parse(data);
        variables = json;
        updateCachedCompletions();
        vscode.window.showInformationMessage("SCSS Variables Completion: Variables reloaded successfully.");
        outputChannel.appendLine("Variables reloaded successfully from JSON.");
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        const msg = `Error parsing "${filePath}": ${errorMessage}`;
        vscode.window.showErrorMessage(`SCSS Variables Completion: ${msg}`);
        outputChannel.appendLine(msg);
        variables = {};
        updateCachedCompletions();
      }
    });
  } else if (source === "scss") {
    const darkPath = config.get<string>("darkThemePath", "theme-dark.scss");
    const lightPath = config.get<string>("lightThemePath", "theme-light.scss");
    const darkFullPath = path.join(workspaceFolder, darkPath);
    const lightFullPath = path.join(workspaceFolder, lightPath);

    Promise.all([parseScssFile(darkFullPath), parseScssFile(lightFullPath)])
      .then(([darkVars, lightVars]) => {
        const merged: { [key: string]: IScssVariable } = {};
        // Merge dark theme variables.
        for (const key in darkVars) {
          merged[key] = {
            value: darkVars[key],
            description: `Dark: ${darkVars[key]}`
          };
        }
        // Merge light theme variables (append if already exists).
        for (const key in lightVars) {
          if (merged[key]) {
            merged[key].description += `, Light: ${lightVars[key]}`;
          } else {
            merged[key] = {
              value: lightVars[key],
              description: `Light: ${lightVars[key]}`
            };
          }
        }
        variables = merged;
        updateCachedCompletions();
        vscode.window.showInformationMessage("SCSS Variables Completion: Variables reloaded successfully from SCSS files.");
        outputChannel.appendLine("Variables reloaded successfully from SCSS files.");
      })
      .catch((err) => {
        const msg = "Error loading SCSS variables: " + err.message;
        vscode.window.showErrorMessage(`SCSS Variables Completion: ${msg}`);
        outputChannel.appendLine(msg);
      });
  }
}

/**
 * Opens the variables file in an editor.
 * In JSON mode, opens the JSON file.
 * In SCSS mode, prompts the user to select which theme file to open.
 */
async function openVariablesFile(): Promise<void> {
  const config = vscode.workspace.getConfiguration("scssVariables");
  const source = config.get<string>("source", "json");
  let filePath: string;
  if (source === "json") {
    filePath = config.get<string>("path", "scssVariables.json");
  } else {
    const choice = await vscode.window.showQuickPick(["Dark Theme", "Light Theme"], {
      placeHolder: "Select the SCSS file to open"
    });
    if (!choice) {
      return;
    }
    filePath = choice === "Dark Theme"
      ? config.get<string>("darkThemePath", "theme-dark.scss")
      : config.get<string>("lightThemePath", "theme-light.scss");
  }

  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    const msg = "SCSS Variables Completion: No workspace folder open.";
    vscode.window.showErrorMessage(msg);
    outputChannel.appendLine(msg);
    return;
  }
  const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const fullPath = path.join(workspaceFolder, filePath);
  try {
    const doc = await vscode.workspace.openTextDocument(fullPath);
    await vscode.window.showTextDocument(doc);
  } catch (err) {
    const msg = `Unable to open file: ${err}`;
    vscode.window.showErrorMessage(`SCSS Variables Completion: ${msg}`);
    outputChannel.appendLine(msg);
  }
}

/**
 * Opens a WebView panel to preview all loaded variables in a table.
 */
function previewVariables(): void {
  const panel = vscode.window.createWebviewPanel(
    "scssVariablesPreview",
    "SCSS Variables Preview",
    vscode.ViewColumn.One,
    {}
  );

  let html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>SCSS Variables Preview</title>
      <style>
        body { font-family: sans-serif; padding: 10px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; }
        th { background-color: #f2f2f2; }
      </style>
    </head>
    <body>
      <h2>SCSS Variables Preview</h2>
      <table>
        <tr>
          <th>Variable</th>
          <th>Value</th>
          <th>Description</th>
        </tr>
  `;
  for (const [key, varData] of Object.entries(variables)) {
    html += `
      <tr>
        <td>--${key}</td>
        <td>${varData.value}</td>
        <td>${varData.description || ""}</td>
      </tr>
    `;
  }
  html += `
      </table>
    </body>
    </html>
  `;
  panel.webview.html = html;
}

/**
 * Activate the extension.
 */
export function activate(context: vscode.ExtensionContext): void {
  // Load variables at startup.
  loadVariables();

  const config = vscode.workspace.getConfiguration("scssVariables");
  const source = config.get<string>("source", "json");
  let filePath: string;
  if (source === "json") {
    filePath = config.get<string>("path", "scssVariables.json");
  } else {
    // In SCSS mode, we'll watch both theme files.
    filePath = "";
  }

  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
    if (source === "json") {
      const fullPath = path.join(workspaceFolder, filePath);
      const fileWatcher = vscode.workspace.createFileSystemWatcher(fullPath);
      fileWatcher.onDidChange(() => loadVariables());
      fileWatcher.onDidCreate(() => loadVariables());
      fileWatcher.onDidDelete(() => {
        variables = {};
        updateCachedCompletions();
        const msg = `File "${filePath}" was deleted.`;
        vscode.window.showErrorMessage(`SCSS Variables Completion: ${msg}`);
        outputChannel.appendLine(msg);
      });
      context.subscriptions.push(fileWatcher);
    } else if (source === "scss") {
      const darkFullPath = path.join(workspaceFolder, config.get<string>("darkThemePath", "theme-dark.scss"));
      const lightFullPath = path.join(workspaceFolder, config.get<string>("lightThemePath", "theme-light.scss"));
      const darkWatcher = vscode.workspace.createFileSystemWatcher(darkFullPath);
      darkWatcher.onDidChange(() => loadVariables());
      darkWatcher.onDidCreate(() => loadVariables());
      darkWatcher.onDidDelete(() => {
        variables = {};
        updateCachedCompletions();
        const msg = `File "${config.get<string>("darkThemePath", "theme-dark.scss")}" was deleted.`;
        vscode.window.showErrorMessage(`SCSS Variables Completion: ${msg}`);
        outputChannel.appendLine(msg);
      });
      context.subscriptions.push(darkWatcher);
      const lightWatcher = vscode.workspace.createFileSystemWatcher(lightFullPath);
      lightWatcher.onDidChange(() => loadVariables());
      lightWatcher.onDidCreate(() => loadVariables());
      lightWatcher.onDidDelete(() => {
        variables = {};
        updateCachedCompletions();
        const msg = `File "${config.get<string>("lightThemePath", "theme-light.scss")}" was deleted.`;
        vscode.window.showErrorMessage(`SCSS Variables Completion: ${msg}`);
        outputChannel.appendLine(msg);
      });
      context.subscriptions.push(lightWatcher);
    }
  }

  // Register the completion provider.
  const provider = vscode.languages.registerCompletionItemProvider(
    ["scss", "module.scss"],
    {
      provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
        const linePrefix = document.lineAt(position).text.substring(0, position.character);
        const regex = /var\(--?([\w\s-]*)$/;
        const match = regex.exec(linePrefix);
        const filter = match ? match[1] : "";
        const filterTokens = filter
          .trim()
          .split(/\s+/)
          .filter((token) => token.length > 0)
          .map((token) => token.toLowerCase());
        const filteredItems = cachedCompletionItems.filter((item) => {
          const key = item.label.toString().replace(/^--/, "").toLowerCase();
          // Use fuzzy matching for each token.
          return filterTokens.every((token) => fuzzyMatch(token, key));
        });
        // Sort alphabetically.
        filteredItems.sort((a, b) =>
          a.label.toString().localeCompare(b.label.toString())
        );
        return filteredItems;
      },
    },
    "-", " " // Trigger on '-' and space characters.
  );
  context.subscriptions.push(provider);

  // Register command: Reload Variables.
  const reloadCommand = vscode.commands.registerCommand("scss-variables-completion.reload", () => {
    loadVariables();
  });
  context.subscriptions.push(reloadCommand);

  // Register command: Open Variables File.
  const openCommand = vscode.commands.registerCommand("scss-variables-completion.open", () => {
    openVariablesFile();
  });
  context.subscriptions.push(openCommand);

  // Register command: Preview All Variables in a WebView.
  const previewCommand = vscode.commands.registerCommand("scss-variables-completion.preview", () => {
    previewVariables();
  });
  context.subscriptions.push(previewCommand);
}

/**
 * Deactivate the extension.
 */
export function deactivate(): void {
  outputChannel.dispose();
}
