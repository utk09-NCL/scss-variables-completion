// src/deepScanner.ts
import * as vscode from "vscode";
import { getExcludedFolders, Logger } from "./config";

/** Describes a variable, mixin, or function defined in SCSS files. */
export type LocalDefinition = {
  name: string; // Name of the item (e.g., "my-color").
  fileUri: vscode.Uri; // Where it’s defined.
  line: number; // Line number in the file.
  kind: "variable" | "mixin" | "function"; // What type it is.
  value?: string; // The actual code (e.g., "#f00").
};

/**
 * Scans the workspace for SCSS/SASS definitions like variables, mixins, and functions.
 * Keeps track of them and updates when files change, with a delay to avoid overloading.
 */
export class DeepScanner {
  private localDefinitions: Map<string, LocalDefinition[]> = new Map(); // Stores all found definitions.
  private scanTimer: NodeJS.Timeout | undefined; // Timer for delayed scans.
  private debounceInterval: number; // How long to wait before rescanning.
  private logger: Logger; // For logging what’s happening.
  private fileWatcher: vscode.FileSystemWatcher; // Watches for file changes.

  /**
   * Sets up a new scanner with a delay and logger.
   *
   * @param debounceInterval - Time (in milliseconds) to wait before scanning after a change.
   * @param logger - Tool for logging messages.
   */
  constructor(debounceInterval: number, logger: Logger) {
    this.debounceInterval = debounceInterval; // Set the delay time.
    this.logger = logger; // Save the logger.
    // Set up a watcher for SCSS and SASS files.
    this.fileWatcher =
      vscode.workspace.createFileSystemWatcher("**/*.{scss,sass}");
    // When a file changes, creates, or deletes, trigger a rescan.
    this.fileWatcher.onDidChange(this.onFileChange.bind(this));
    this.fileWatcher.onDidCreate(this.onFileChange.bind(this));
    this.fileWatcher.onDidDelete(this.onFileChange.bind(this));
  }

  /**
   * Responds to file changes by scheduling a new scan.
   *
   * @param uri - The file that changed.
   */
  private onFileChange(uri: vscode.Uri): void {
    this.logger.debug(`File change detected: ${uri.fsPath}`); // Log the change.
    this.scheduleScan(); // Plan a rescan.
  }

  /** Plans a scan after a delay, canceling any previous plan. */
  private scheduleScan(): void {
    if (this.scanTimer) {
      clearTimeout(this.scanTimer); // Cancel the old timer.
    }
    // Set a new timer to scan after the delay.
    this.scanTimer = setTimeout(() => {
      this.scanWorkspace();
    }, this.debounceInterval);
  }

  /** Scans all SCSS/SASS files in the workspace for definitions. */
  public async scanWorkspace(): Promise<void> {
    this.logger.info("Starting deep scan of workspace for SCSS definitions"); // Log the start.
    this.localDefinitions.clear(); // Reset the list of definitions.
    try {
      // Find all SCSS/SASS files, ignoring excluded folders.
      const files = await vscode.workspace.findFiles(
        "**/*.{scss,sass}",
        `{${getExcludedFolders().join(",")}}`
      );
      // Process each file.
      for (const file of files) {
        const document = await vscode.workspace.openTextDocument(file); // Open the file.
        this.parseDocument(document); // Look for definitions in it.
      }
      // Log how many definitions were found.
      this.logger.info("Deep scan completed", {
        count: this.getLocalDefinitions().length,
      });
    } catch (err) {
      this.logger.error("Error during deep scan", err); // Log any problems.
    }
  }

  /**
   * Looks through a file for SCSS variables, CSS variables, mixins, and functions.
   *
   * @param document - The file to check.
   */
  private parseDocument(document: vscode.TextDocument): void {
    const lines = document.getText().split(/\r?\n/); // Split into lines.
    lines.forEach((line, index) => {
      // Look for SCSS variables like "$color: red;".
      const variableMatch = line.match(/^\s*\$([\w-]+)\s*:/);
      if (variableMatch) {
        const name = variableMatch[1]; // Get the variable name.
        const def: LocalDefinition = {
          name,
          fileUri: document.uri,
          line: index,
          kind: "variable",
          value: line.trim(), // Save the full line.
        };
        this.addLocalDefinition(name, def); // Store it.
      }
      // Look for CSS variables like "--color: #f00;".
      const cssVarMatch = line.match(/^\s*--([\w-]+)\s*:/);
      if (cssVarMatch) {
        const name = cssVarMatch[1];
        const def: LocalDefinition = {
          name,
          fileUri: document.uri,
          line: index,
          kind: "variable",
          value: line.trim(),
        };
        this.addLocalDefinition(name, def);
      }
      // Look for mixins like "@mixin my-mixin {".
      const mixinMatch = line.match(/^\s*@mixin\s+([\w-]+)/);
      if (mixinMatch) {
        const name = mixinMatch[1];
        const def: LocalDefinition = {
          name,
          fileUri: document.uri,
          line: index,
          kind: "mixin",
          value: line.trim(),
        };
        this.addLocalDefinition(name, def);
      }
      // Look for functions like "@function my-func() {".
      const functionMatch = line.match(/^\s*@function\s+([\w-]+)/);
      if (functionMatch) {
        const name = functionMatch[1];
        const def: LocalDefinition = {
          name,
          fileUri: document.uri,
          line: index,
          kind: "function",
          value: line.trim(),
        };
        this.addLocalDefinition(name, def);
      }
    });
  }

  /**
   * Adds a definition to the collection, grouping by name.
   *
   * @param name - The name of the variable/mixin/function.
   * @param def - The definition details.
   */
  private addLocalDefinition(name: string, def: LocalDefinition): void {
    if (!this.localDefinitions.has(name)) {
      this.localDefinitions.set(name, []); // Start a new list if needed.
    }
    this.localDefinitions.get(name)?.push(def); // Add to the list.
  }

  /** Gets all definitions as a flat array. */
  public getLocalDefinitions(): LocalDefinition[] {
    let results: LocalDefinition[] = [];
    this.localDefinitions.forEach((defs) => {
      results = results.concat(defs); // Combine all lists into one.
    });
    return results;
  }

  /** Cleans up resources when the scanner is no longer needed. */
  public dispose(): void {
    this.fileWatcher.dispose(); // Stop watching files.
    if (this.scanTimer) {
      clearTimeout(this.scanTimer); // Cancel any pending scan.
    }
  }
}
