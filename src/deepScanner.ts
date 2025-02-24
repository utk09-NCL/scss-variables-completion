// src/deepScanner.ts
import * as vscode from "vscode";
import {
  getExcludedFolders,
  getScanPaths,
  getMaxScanDepth,
  Logger,
  showScanProgress,
} from "./config";

/**
 * Represents a local SCSS definition found in the workspace (e.g., variable, mixin, or function).
 */
export type LocalDefinition = {
  name: string; // The name (e.g., "my-color").
  fileUri: vscode.Uri; // The file where it’s defined.
  line: number; // The line number (0-based).
  kind: "variable" | "mixin" | "function"; // The type of definition.
  value?: string; // The actual code (e.g., "#f00").
};

/**
 * Scans the workspace for SCSS/SASS definitions and keeps them updated.
 * Uses a debounce delay to avoid scanning too often when files change.
 */
export class DeepScanner {
  // Stores definitions, grouped by name (e.g., "my-color" -> array of definitions).
  private localDefinitions: Map<string, LocalDefinition[]> = new Map();
  // Timer for delaying scans after file changes.
  private scanTimer: NodeJS.Timeout | undefined;
  // Delay time in milliseconds before rescanning.
  private debounceInterval: number;
  // Logger for tracking scan activity.
  private logger: Logger;
  // Watches SCSS/SASS files for changes.
  private fileWatcher: vscode.FileSystemWatcher;
  // Maximum folder depth to scan.
  private maxScanDepth: number;

  /**
   * Creates a new scanner instance with a delay and logger.
   *
   * @param debounceInterval - Time (in ms) to wait before rescanning after a change.
   * @param logger - Logger for debug/info/error messages.
   */
  constructor(debounceInterval: number, logger: Logger) {
    this.debounceInterval = debounceInterval; // Set the delay time.
    this.logger = logger; // Store the logger.
    this.maxScanDepth = getMaxScanDepth(); // Get the max depth from settings.
    // Set up a watcher for SCSS and SASS files.
    this.fileWatcher =
      vscode.workspace.createFileSystemWatcher("**/*.{scss,sass}");
    // Bind event handlers to watch for file changes.
    this.fileWatcher.onDidChange(this.onFileChange.bind(this));
    this.fileWatcher.onDidCreate(this.onFileChange.bind(this));
    this.fileWatcher.onDidDelete(this.onFileChange.bind(this));
  }

  /**
   * Handles file changes by scheduling a new scan.
   *
   * @param uri - The URI of the file that changed.
   */
  private onFileChange(uri: vscode.Uri): void {
    // Log that a file change was detected.
    this.logger.debug(`File change detected: ${uri.fsPath}`);
    this.scheduleScan(); // Plan a rescan.
  }

  /**
   * Schedules a scan after a delay, canceling any previous scheduled scan.
   */
  private scheduleScan(): void {
    if (this.scanTimer) {
      clearTimeout(this.scanTimer); // Cancel the old timer if it exists.
    }
    this.scanTimer = setTimeout(() => {
      this.scanWorkspace(false); // Silent scan for file changes (no progress notification)
    }, this.debounceInterval);
  }

  /**
   * Scans the workspace for SCSS/SASS files and finds variables, mixins, and functions.
   * Optionally shows a progress notification based on user settings.
   *
   * @param showProgress - Whether to show a progress notification (default: true for initial/manual scans).
   */
  public async scanWorkspace(showProgress = true): Promise<void> {
    const showScanProgressSetting = showScanProgress(); // Get current setting for progress notifications

    if (showProgress && showScanProgressSetting) {
      return vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Scanning workspace for SCSS definitions",
          cancellable: false,
        },
        async (progress) => {
          // Log the start of the scan.
          this.logger.info(
            "Starting deep scan of workspace for SCSS definitions"
          );
          this.localDefinitions.clear();
          try {
            // Get user-defined scan paths, or use a default if none are set.
            const scanPaths = getScanPaths();
            const includePattern =
              scanPaths.length > 0
                ? `{${scanPaths.join(",")}}`
                : "**/*.{scss,sass}";
            // Get folders to exclude from the scan.
            const excludePattern = `{${getExcludedFolders().join(",")}}`;
            const files = await vscode.workspace.findFiles(
              includePattern,
              excludePattern,
              this.maxScanDepth
            );
            // Update the progress bar with the number of files found.
            progress.report({ message: `Found ${files.length} files to scan` });

            for (let i = 0; i < files.length; i++) {
              const document = await vscode.workspace.openTextDocument(
                files[i]
              );
              this.parseDocument(document); // Look for definitions in the file.
              // Update progress with the current file count.
              progress.report({
                message: `Processed ${i + 1}/${files.length} files`,
              });
            }
            // Log how many definitions were found.
            this.logger.info("Deep scan completed", {
              count: this.getLocalDefinitions().length,
            });
          } catch (err) {
            // Log any errors that occur during the scan.
            this.logger.error("Error during deep scan", err);
          }
        }
      );
    } else {
      // Silent scan (no progress notification)
      this.logger.info(
        "Starting silent scan of workspace for SCSS definitions"
      );
      this.localDefinitions.clear();
      try {
        const scanPaths = getScanPaths();
        const includePattern =
          scanPaths.length > 0
            ? `{${scanPaths.join(",")}}`
            : "**/*.{scss,sass}";
        const excludePattern = `{${getExcludedFolders().join(",")}}`;
        const files = await vscode.workspace.findFiles(
          includePattern,
          excludePattern,
          this.maxScanDepth
        );

        for (const file of files) {
          const document = await vscode.workspace.openTextDocument(file);
          this.parseDocument(document);
        }
        this.logger.info("Silent scan completed", {
          count: this.getLocalDefinitions().length,
        });
      } catch (err) {
        this.logger.error("Error during silent scan", err);
      }
    }
  }

  /**
   * Parses a single SCSS/SASS file to find definitions.
   *
   * @param document - The file to scan.
   */
  private parseDocument(document: vscode.TextDocument): void {
    // Split the file into lines.
    const lines = document.getText().split(/\r?\n/);
    // Check each line for definitions.
    lines.forEach((line, index) => {
      // Look for SCSS variables like "$my-var: value;".
      const variableMatch = line.match(/^\s*\$([\w-]+)\s*:/);
      if (variableMatch) {
        const name = variableMatch[1];
        const def: LocalDefinition = {
          name,
          fileUri: document.uri,
          line: index,
          kind: "variable",
          value: line.trim(),
        };
        this.addLocalDefinition(name, def); // Add to the collection.
      }

      // Look for CSS custom properties like "--my-var: #f00;".
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
   * @param def - The definition details to add.
   */
  private addLocalDefinition(name: string, def: LocalDefinition): void {
    if (!this.localDefinitions.has(name)) {
      this.localDefinitions.set(name, []); // Create a new array if this name isn’t tracked yet.
    }
    this.localDefinitions.get(name)?.push(def); // Add the definition to the array.
  }

  /**
   * Gets all local definitions as a flat array.
   *
   * @returns An array of all definitions found in the workspace.
   */
  public getLocalDefinitions(): LocalDefinition[] {
    let results: LocalDefinition[] = [];
    // Combine all definition arrays into one.
    this.localDefinitions.forEach((defs) => {
      results = results.concat(defs);
    });
    return results;
  }

  /**
   * Cleans up resources when the extension stops.
   */
  public dispose(): void {
    this.fileWatcher.dispose(); // Stop watching files.
    if (this.scanTimer) {
      clearTimeout(this.scanTimer); // Cancel any pending scan.
    }
  }
}
