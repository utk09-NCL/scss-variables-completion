// src/deepScanner.ts
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  getExcludedFolders,
  getMaxScanDepth,
  getDebounceInterval,
  Logger,
  isInterpolatedVariablesEnabled,
  getMaxFilesPerBatch,
  getBatchScanDelay,
  isParallelScanningEnabled,
  getMaxParallelScans,
  getAdditionalExcludePatterns,
  getMaxFileSize,
} from "./config";

/**
 * Represents a locally defined SCSS variable's details from the workspace.
 */
export interface LocalDefinition {
  /** The name of the SCSS variable (without $) */
  name: string;
  /** The value assigned to this variable */
  value?: string;
  /** The type of definition (variable, mixin, function) */
  kind: "variable" | "mixin" | "function" | "map" | "list";
  /** The URI of the file where this variable is defined */
  fileUri: vscode.Uri;
  /** The 0-based line number where this variable is defined */
  line: number;
  /** Optional comment associated with this variable */
  comment?: string;
  /** For map/list types, the parsed map key-value pairs or list items */
  children?: Array<{ key?: string; value: string }>;
  /** Whether this variable is imported from another file */
  imported?: boolean;
  /** Original file for imported variables */
  importedFrom?: vscode.Uri;
  /** Variables this definition depends on or references */
  references?: string[];
}

/**
 * DeepScanner provides deep workspace scanning to find and track local SCSS variable definitions.
 * It implements custom debounce logic and handles disposable resources.
 */
export class DeepScanner implements vscode.Disposable {
  // Collection to store current variable definitions
  private localDefinitions: LocalDefinition[] = [];
  // File system watcher to track changes to SCSS files
  private fileWatcher: vscode.FileSystemWatcher;
  // Flag to prevent duplicate scans on file changes
  private scanInProgress = false;
  // Timeout ID for debouncing file changes
  private debounceTimeout: NodeJS.Timeout | null = null;
  // Storage for persistent variable caching between sessions
  private globalStorageCache: vscode.Memento | undefined;
  // Cache of imports between files
  private importCache = new Map<string, string[]>();
  // Track processed files to avoid circular imports
  private processedFiles = new Set<string>();

  /**
   * Creates a new DeepScanner to find and track SCSS variable definitions in a workspace.
   *
   * @param debounceMs - The debounce time in milliseconds for file change handling
   * @param logger - A logger to record scanning information
   * @param context - Extension context for state persistence
   */
  constructor(
    private debounceMs: number,
    private logger: Logger,
    context?: vscode.ExtensionContext
  ) {
    // Get the actual debounce interval from config, falling back to the parameter value
    this.debounceMs = getDebounceInterval(debounceMs);

    // Set up the global storage for caching if context is provided
    if (context) {
      this.globalStorageCache = context.globalState;

      // Try to load cached data
      const cachedDefs =
        this.globalStorageCache.get<LocalDefinition[]>("localDefinitions");
      if (cachedDefs && Array.isArray(cachedDefs)) {
        this.logger.info(
          `Loaded ${cachedDefs.length} variable definitions from cache`
        );

        // Convert plain objects to proper LocalDefinition objects with correct URIs
        this.localDefinitions = cachedDefs.map((def) => ({
          ...def,
          fileUri:
            typeof def.fileUri === "string"
              ? vscode.Uri.parse(def.fileUri)
              : def.fileUri,
          importedFrom:
            def.importedFrom && typeof def.importedFrom === "string"
              ? vscode.Uri.parse(def.importedFrom)
              : def.importedFrom,
        }));
      }
    }

    // Create a file watcher for SCSS/CSS files
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      "**/*.{scss,css,module.scss}"
    );

    // Set up listeners for file changes
    this.fileWatcher.onDidChange(this.onFileChanged.bind(this));
    this.fileWatcher.onDidCreate(this.onFileChanged.bind(this));
    this.fileWatcher.onDidDelete(this.onFileDeleted.bind(this));

    this.logger.debug(
      `DeepScanner initialized with ${this.debounceMs}ms debounce`
    );
  }

  /**
   * Handles file changes by debouncing the scan operation.
   * @param uri - The URI of the changed file
   */
  private onFileChanged(uri: vscode.Uri): void {
    // Skip files in excluded folders
    const excludedFolders = getExcludedFolders();
    const relativePath = vscode.workspace.asRelativePath(uri);

    for (const folder of excludedFolders) {
      if (relativePath.startsWith(folder + path.sep)) {
        this.logger.debug(`Skipping excluded file: ${relativePath}`);
        return;
      }
    }

    // Clear any existing timeout
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    // Set a new timeout
    this.debounceTimeout = setTimeout(async () => {
      if (this.scanInProgress) {
        this.logger.debug("Scan already in progress, skipping");
        return;
      }

      this.logger.debug(`File changed: ${uri.fsPath}. Scanning...`);

      // For a single file change, just re-scan that file and any files that import it
      await this.scanSingleFileAndDependents(uri);

      // Clear the timeout reference
      this.debounceTimeout = null;
    }, this.debounceMs);
  }

  /**
   * Handles file deletions by removing their definitions.
   * @param uri - The URI of the deleted file
   */
  private onFileDeleted(uri: vscode.Uri): void {
    // Remove definitions from this file
    this.localDefinitions = this.localDefinitions.filter(
      (def) =>
        !def.fileUri.fsPath.toLowerCase().startsWith(uri.fsPath.toLowerCase())
    );

    // Remove from import cache
    this.importCache.delete(uri.fsPath);

    // Look for files that might have imported this one and scan them
    const importers = this.findImportingFiles(uri);
    for (const importer of importers) {
      this.onFileChanged(importer);
    }

    this.logger.debug(`File deleted: ${uri.fsPath}. Definitions removed.`);

    // Update cache if applicable
    this.updateCache();
  }

  /**
   * Finds files that import the specified file
   * @param uri - The URI of the file to check imports for
   * @returns Array of URIs that import the specified file
   */
  private findImportingFiles(uri: vscode.Uri): vscode.Uri[] {
    const importers: vscode.Uri[] = [];

    // Check each entry in the import cache
    for (const [filePath, imports] of this.importCache.entries()) {
      // Check if this file imports the specified file
      if (
        imports.some(
          (importPath) =>
            path.resolve(path.dirname(filePath), importPath) === uri.fsPath
        )
      ) {
        importers.push(vscode.Uri.file(filePath));
      }
    }

    return importers;
  }

  /**
   * Scans a single file and all files that depend on it.
   * @param uri - The URI of the file to scan
   */
  private async scanSingleFileAndDependents(uri: vscode.Uri): Promise<void> {
    try {
      this.scanInProgress = true;

      // Clear existing definitions from this file
      this.localDefinitions = this.localDefinitions.filter(
        (def) => def.fileUri.fsPath !== uri.fsPath
      );

      // Scan the file
      this.processedFiles.clear();
      await this.scanFile(uri, false);

      // Look for files that might import this one and scan them
      const importers = this.findImportingFiles(uri);
      for (const importer of importers) {
        this.logger.debug(`Rescanning dependent file: ${importer.fsPath}`);

        // Clear existing definitions from this file
        this.localDefinitions = this.localDefinitions.filter(
          (def) => def.fileUri.fsPath !== importer.fsPath
        );

        // Reset processed files for each importer scan
        this.processedFiles.clear();
        await this.scanFile(importer, false);
      }

      // Update cache if applicable
      this.updateCache();
    } catch (e) {
      this.logger.error(`Error scanning file ${uri.fsPath}: ${e}`);
    } finally {
      this.scanInProgress = false;
    }
  }

  /**
   * Updates the persistent cache with the current definitions
   */
  private updateCache(): void {
    if (this.globalStorageCache) {
      // Convert URIs to strings for serialization
      const serializableDefs = this.localDefinitions.map((def) => ({
        ...def,
        fileUri: def.fileUri.toString(),
        importedFrom: def.importedFrom
          ? def.importedFrom.toString()
          : undefined,
      }));

      this.globalStorageCache.update("localDefinitions", serializableDefs);
      this.logger.debug(
        `Updated cache with ${serializableDefs.length} definitions`
      );
    }
  }

  /**
   * Scans the entire workspace for SCSS variable definitions.
   * @returns A promise that resolves when scanning is complete
   */
  public async scanWorkspace(): Promise<void> {
    try {
      this.scanInProgress = true;
      this.logger.info("Starting workspace scan...");

      // Show progress notification
      const progressOptions: vscode.ProgressOptions = {
        location: vscode.ProgressLocation.Notification,
        title: "SCSS Variables: Scanning workspace",
        cancellable: true,
      };

      await vscode.window.withProgress(
        progressOptions,
        async (progress, token) => {
          // Get all SCSS files in the workspace
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (!workspaceFolders) {
            this.logger.warn("No workspace folders found");
            return;
          }

          const files: vscode.Uri[] = [];
          for (const folder of workspaceFolders) {
            const folderFiles = await this.findScssFiles(folder.uri, 0);
            files.push(...folderFiles);
          }

          const totalFiles = files.length;
          let processedFiles = 0;

          // Process files in batches
          const batchSize = getMaxFilesPerBatch();
          const delay = getBatchScanDelay();
          const enableParallel = isParallelScanningEnabled();
          const maxParallel = getMaxParallelScans();

          for (let i = 0; i < files.length; i += batchSize) {
            if (token.isCancellationRequested) {
              this.logger.info("Workspace scan cancelled by user");
              return;
            }

            const batch = files.slice(i, i + batchSize);
            processedFiles += batch.length;

            // Update progress
            progress.report({
              message: `Processing files ${processedFiles}/${totalFiles}`,
              increment: (batch.length / totalFiles) * 100,
            });

            if (enableParallel) {
              // Process files in parallel with a limit
              const chunks = this.chunkArray(batch, maxParallel);
              for (const chunk of chunks) {
                await Promise.all(
                  chunk.map((file) => this.scanFile(file, true))
                );
              }
            } else {
              // Process files sequentially
              for (const file of batch) {
                await this.scanFile(file, true);
              }
            }

            // Add delay between batches if configured
            if (delay > 0) {
              await new Promise((resolve) => setTimeout(resolve, delay));
            }
          }
        }
      );

      this.logger.info(
        `Workspace scan complete. Found ${this.localDefinitions.length} variable definitions.`
      );
    } catch (e) {
      this.logger.error(`Error scanning workspace: ${e}`);
      vscode.window.showErrorMessage(`Error scanning workspace: ${e}`);
    } finally {
      this.scanInProgress = false;
    }
  }

  /**
   * Recursively finds all SCSS/CSS files in a directory.
   *
   * @param uri - The URI of the directory to scan
   * @param currentDepth - The current depth of recursion
   * @returns A promise that resolves to an array of file URIs
   */
  private async findScssFiles(
    uri: vscode.Uri,
    currentDepth: number
  ): Promise<vscode.Uri[]> {
    const scssFiles: vscode.Uri[] = [];
    const excludedFolders = getExcludedFolders();
    const additionalExcludePatterns = getAdditionalExcludePatterns();
    const maxDepth = getMaxScanDepth();
    const maxFileSize = getMaxFileSize();

    // Check if we've reached the maximum depth
    if (currentDepth > maxDepth) {
      return scssFiles;
    }

    try {
      const stats = await vscode.workspace.fs.stat(uri);

      // Skip if file is too large
      if (stats.type === vscode.FileType.File && stats.size > maxFileSize) {
        this.logger.debug(
          `Skipping large file: ${uri.fsPath} (${stats.size} bytes)`
        );
        return scssFiles;
      }

      // Skip if it's a directory in excluded folders
      if (stats.type === vscode.FileType.Directory) {
        const dirName = path.basename(uri.fsPath);
        if (excludedFolders.includes(dirName)) {
          return scssFiles;
        }

        // Check additional exclude patterns
        const relativePath = vscode.workspace.asRelativePath(uri);
        if (
          additionalExcludePatterns.some((pattern) => {
            const regex = new RegExp(
              pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*")
            );
            return regex.test(relativePath);
          })
        ) {
          return scssFiles;
        }

        // Read directory contents
        const entries = await vscode.workspace.fs.readDirectory(uri);

        // Process entries in parallel if enabled
        if (isParallelScanningEnabled()) {
          const maxParallel = getMaxParallelScans();
          const chunks = this.chunkArray(entries, maxParallel);

          for (const chunk of chunks) {
            const results = await Promise.all(
              chunk.map(async ([name]) => {
                const fileUri = vscode.Uri.joinPath(uri, name);
                return this.findScssFiles(fileUri, currentDepth + 1);
              })
            );
            scssFiles.push(...results.flat());
          }
        } else {
          // Process entries sequentially
          for (const [name] of entries) {
            const fileUri = vscode.Uri.joinPath(uri, name);
            const files = await this.findScssFiles(fileUri, currentDepth + 1);
            scssFiles.push(...files);
          }
        }
      } else if (stats.type === vscode.FileType.File) {
        // Check if it's an SCSS file
        if (uri.fsPath.endsWith(".scss") || uri.fsPath.endsWith(".css")) {
          scssFiles.push(uri);
        }
      }
    } catch (error) {
      this.logger.warn(`Error scanning ${uri.fsPath}: ${error}`);
    }

    return scssFiles;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Scans a single SCSS/CSS file for variable definitions.
   *
   * @param uri - The URI of the file to scan
   * @param trackImports - Whether to track imports in the cache
   */
  private async scanFile(
    uri: vscode.Uri,
    trackImports: boolean = true
  ): Promise<void> {
    // Check if file has already been processed (avoid circular imports)
    const normalizedPath = uri.fsPath.toLowerCase();
    if (this.processedFiles.has(normalizedPath)) {
      return;
    }

    this.processedFiles.add(normalizedPath);

    try {
      const content = await fs.promises.readFile(uri.fsPath, "utf8");

      // Extract imports first to ensure dependencies are processed
      const imports = this.extractImports(content);

      if (trackImports) {
        this.importCache.set(uri.fsPath, imports);
      }

      // Process each import
      for (const importPath of imports) {
        let resolvedPath = importPath;

        // Handle relative paths
        if (!path.isAbsolute(resolvedPath)) {
          resolvedPath = path.resolve(path.dirname(uri.fsPath), resolvedPath);
        }

        // Add .scss extension if missing
        if (
          !resolvedPath.endsWith(".scss") &&
          !resolvedPath.endsWith(".css") &&
          !fs.existsSync(resolvedPath)
        ) {
          resolvedPath += ".scss";
        }

        // Check for partial file naming (_filename.scss)
        if (!fs.existsSync(resolvedPath)) {
          const dir = path.dirname(resolvedPath);
          const filename = path.basename(resolvedPath);
          const partialPath = path.join(dir, `_${filename}`);

          if (fs.existsSync(partialPath)) {
            resolvedPath = partialPath;
          }
        }

        // Process the imported file if it exists
        if (fs.existsSync(resolvedPath)) {
          await this.scanFile(vscode.Uri.file(resolvedPath), trackImports);
        }
      }

      // Extract variables, mixins, and functions
      this.extractVariables(content, uri);
    } catch (e) {
      this.logger.debug(`Error scanning file ${uri.fsPath}: ${e}`);
    }
  }

  /**
   * Extracts all imports from an SCSS file.
   *
   * @param content - The content of the SCSS file
   * @returns An array of import paths
   */
  private extractImports(content: string): string[] {
    const imports: string[] = [];

    // Match standard @import statements
    // This handles multi-line imports and comma-separated lists
    const importRegex = /@import\s+(?:(?:'([^']+)'|"([^"]+)")\s*,?\s*)+\s*;/g;
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(content)) !== null) {
      // Extract the whole import statement
      const importStatement = match[0];

      // Extract individual paths from the import statement
      const pathRegex = /'([^']+)'|"([^"]+)"/g;
      let pathMatch: RegExpExecArray | null;

      while ((pathMatch = pathRegex.exec(importStatement)) !== null) {
        const importPath = pathMatch[1] || pathMatch[2];
        imports.push(importPath);
      }
    }

    // Match @use and @forward statements (Sass modules)
    const moduleRegex = /(?:@use|@forward)\s+(?:'([^']+)'|"([^"]+)")/g;

    while ((match = moduleRegex.exec(content)) !== null) {
      const importPath = match[1] || match[2];
      imports.push(importPath);
    }

    return imports;
  }

  /**
   * Extracts variable, mixin, and function definitions from an SCSS file.
   *
   * @param content - The content of the SCSS file
   * @param uri - The URI of the file
   */
  private extractVariables(content: string, uri: vscode.Uri): void {
    // SCSS/CSS variable definitions ($var: value or --var: value)
    this.extractScssVariables(content, uri);

    // Extract mixins
    this.extractMixins(content, uri);

    // Extract functions
    this.extractFunctions(content, uri);

    // Extract lists and maps
    this.extractComplexTypes(content, uri);

    // Extract interpolated variables if enabled
    if (isInterpolatedVariablesEnabled()) {
      this.extractInterpolatedVariables(content, uri);
    }
  }

  /**
   * Extracts interpolated variable names from SCSS content.
   * These are variables used in the format #{$variable-name}
   *
   * @param content - The content of the SCSS file
   * @param uri - The URI of the file
   */
  private extractInterpolatedVariables(content: string, uri: vscode.Uri): void {
    const lines = content.split("\n");
    // Look for #{$...} pattern
    const interpolatedRegex = /#{(\$[\w-]+)}/g;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      let match: RegExpExecArray | null;

      while ((match = interpolatedRegex.exec(line)) !== null) {
        const variableName = match[1].substring(1); // Remove $ prefix

        // Check if this variable is already defined elsewhere
        const existingVariable = this.localDefinitions.find(
          (def) =>
            def.name === variableName &&
            (def.kind === "variable" ||
              def.kind === "map" ||
              def.kind === "list")
        );

        if (!existingVariable) {
          // Add as a reference to an unknown variable
          this.localDefinitions.push({
            name: variableName,
            value: `Interpolated as #{$${variableName}}`,
            kind: "variable",
            fileUri: uri,
            line: lineIndex,
            comment: "Used in string interpolation",
          });
        }
      }
    }
  }

  /**
   * Extracts SCSS variable definitions from the file.
   *
   * @param content - The content of the file
   * @param uri - The URI of the file
   */
  private extractScssVariables(content: string, uri: vscode.Uri): void {
    // Regular SCSS variables ($var: value)
    const lines = content.split("\n");
    const scssVariableRegex =
      /^\s*(\$[\w-]+)\s*:\s*([^;(]*(?:\([^)]*\)[^;]*)?);/;

    // Multiline variable regex (handles values spread across lines)
    const multilineStartRegex = /^\s*(\$[\w-]+)\s*:\s*(.*?)(?:;|$)/;
    const multilineEndRegex = /^\s*([^$@].*?);/;

    let multilineVar: { name: string; value: string; line: number } | null =
      null;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      // Check for comment above the variable
      let comment: string | undefined;
      if (lineIndex > 0) {
        const prevLine = lines[lineIndex - 1].trim();
        if (prevLine.startsWith("//")) {
          comment = prevLine.substring(2).trim();
        } else if (
          lineIndex > 1 &&
          prevLine === "*/" &&
          lines[lineIndex - 2].trim().startsWith("/*")
        ) {
          // Multi-line comment
          const commentLines = [];
          let j = lineIndex - 2;
          while (j >= 0 && !lines[j].trim().startsWith("/*")) {
            if (lines[j].trim().startsWith("*")) {
              commentLines.unshift(lines[j].trim().substring(1).trim());
            }
            j--;
          }
          comment = commentLines.join(" ");
        }
      }

      // Continue multiline variable if we're tracking one
      if (multilineVar) {
        const endMatch = multilineEndRegex.exec(line);
        if (endMatch) {
          // End of multiline variable
          multilineVar.value += " " + endMatch[1].trim();

          // Extract references to other variables
          const references = this.extractVariableReferences(multilineVar.value);

          // Add to definitions
          this.localDefinitions.push({
            name: multilineVar.name.substring(1), // Remove $ prefix
            value: `$${multilineVar.name}: ${multilineVar.value}`,
            kind: "variable",
            fileUri: uri,
            line: multilineVar.line,
            comment,
            references,
          });

          multilineVar = null;
        } else if (!line.trim().startsWith("//")) {
          // Continue multiline, skip comment lines
          multilineVar.value += " " + line.trim();
        }
        continue;
      }

      // Check for start of multiline variable
      const multilineMatch = multilineStartRegex.exec(line);
      if (multilineMatch && !line.includes(";")) {
        multilineVar = {
          name: multilineMatch[1],
          value: multilineMatch[2].trim(),
          line: lineIndex,
        };
        continue;
      }

      // Standard single-line variable
      const match = scssVariableRegex.exec(line);
      if (match) {
        const name = match[1].substring(1); // Remove $ prefix
        const value = match[0].trim();

        // Extract references to other variables
        const references = this.extractVariableReferences(value);

        this.localDefinitions.push({
          name,
          value,
          kind: "variable",
          fileUri: uri,
          line: lineIndex,
          comment,
          references,
        });
      }
    }

    // CSS custom properties (--var: value)
    const cssVarRegex = /^\s*(--[\w-]+)\s*:\s*([^;]*);/;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      // Check for comment above the variable
      let comment: string | undefined;
      if (lineIndex > 0) {
        const prevLine = lines[lineIndex - 1].trim();
        if (prevLine.startsWith("//")) {
          comment = prevLine.substring(2).trim();
        } else if (
          lineIndex > 1 &&
          prevLine === "*/" &&
          lines[lineIndex - 2].trim().startsWith("/*")
        ) {
          // Multi-line comment
          const commentLines = [];
          let j = lineIndex - 2;
          while (j >= 0 && !lines[j].trim().startsWith("/*")) {
            if (lines[j].trim().startsWith("*")) {
              commentLines.unshift(lines[j].trim().substring(1).trim());
            }
            j--;
          }
          comment = commentLines.join(" ");
        }
      }

      const match = cssVarRegex.exec(line);
      if (match) {
        const name = match[1].substring(2); // Remove -- prefix
        const value = match[0].trim();

        // Extract references to other variables
        const references = this.extractVariableReferences(value);

        this.localDefinitions.push({
          name,
          value,
          kind: "variable",
          fileUri: uri,
          line: lineIndex,
          comment,
          references,
        });
      }
    }
  }

  /**
   * Extracts mixin definitions from a file.
   *
   * @param content - The content of the file
   * @param uri - The URI of the file
   */
  private extractMixins(content: string, uri: vscode.Uri): void {
    const lines = content.split("\n");
    const mixinRegex = /^\s*@mixin\s+([\w-]+)(?:\(([^)]*)\))?\s*{/;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      // Check for comment above the mixin
      let comment: string | undefined;
      if (lineIndex > 0) {
        const prevLine = lines[lineIndex - 1].trim();
        if (prevLine.startsWith("//")) {
          comment = prevLine.substring(2).trim();
        } else if (
          lineIndex > 1 &&
          prevLine === "*/" &&
          lines[lineIndex - 2].trim().startsWith("/*")
        ) {
          // Multi-line comment
          const commentLines = [];
          let j = lineIndex - 2;
          while (j >= 0 && !lines[j].trim().startsWith("/*")) {
            if (lines[j].trim().startsWith("*")) {
              commentLines.unshift(lines[j].trim().substring(1).trim());
            }
            j--;
          }
          comment = commentLines.join(" ");
        }
      }

      const match = mixinRegex.exec(line);
      if (match) {
        const name = match[1];
        const params = match[2] || "";

        this.localDefinitions.push({
          name,
          value: `@mixin ${name}(${params}) { ... }`,
          kind: "mixin",
          fileUri: uri,
          line: lineIndex,
          comment,
        });
      }
    }
  }

  /**
   * Extracts function definitions from a file.
   *
   * @param content - The content of the file
   * @param uri - The URI of the file
   */
  private extractFunctions(content: string, uri: vscode.Uri): void {
    const lines = content.split("\n");
    const functionRegex = /^\s*@function\s+([\w-]+)(?:\(([^)]*)\))?\s*{/;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      // Check for comment above the function
      let comment: string | undefined;
      if (lineIndex > 0) {
        const prevLine = lines[lineIndex - 1].trim();
        if (prevLine.startsWith("//")) {
          comment = prevLine.substring(2).trim();
        } else if (
          lineIndex > 1 &&
          prevLine === "*/" &&
          lines[lineIndex - 2].trim().startsWith("/*")
        ) {
          // Multi-line comment
          const commentLines = [];
          let j = lineIndex - 2;
          while (j >= 0 && !lines[j].trim().startsWith("/*")) {
            if (lines[j].trim().startsWith("*")) {
              commentLines.unshift(lines[j].trim().substring(1).trim());
            }
            j--;
          }
          comment = commentLines.join(" ");
        }
      }

      const match = functionRegex.exec(line);
      if (match) {
        const name = match[1];
        const params = match[2] || "";

        this.localDefinitions.push({
          name,
          value: `@function ${name}(${params}) { ... }`,
          kind: "function",
          fileUri: uri,
          line: lineIndex,
          comment,
        });
      }
    }
  }

  /**
   * Extracts complex types like maps and lists from a file.
   *
   * @param content - The content of the file
   * @param uri - The URI of the file
   */
  private extractComplexTypes(content: string, uri: vscode.Uri): void {
    const lines = content.split("\n");

    // SCSS map or list starting pattern
    const mapStartRegex = /^\s*(\$[\w-]+)\s*:\s*\(\s*$/;
    const inlineMapRegex = /^\s*(\$[\w-]+)\s*:\s*\((.*)\)\s*;/;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      // Check for inline map/list definition
      const inlineMatch = inlineMapRegex.exec(line);
      if (inlineMatch) {
        const name = inlineMatch[1].substring(1); // Remove $ prefix
        const value = inlineMatch[2].trim();

        // Determine if it's a map or list
        const isMap = value.includes(":");

        // Parse the values
        const children: Array<{ key?: string; value: string }> = [];

        if (isMap) {
          // Parse map entries
          const entries = this.splitMapEntries(value);

          for (const entry of entries) {
            const parts = entry.split(":");
            if (parts.length === 2) {
              children.push({
                key: parts[0].trim(),
                value: parts[1].trim(),
              });
            }
          }

          this.localDefinitions.push({
            name,
            value: line.trim(),
            kind: "map",
            fileUri: uri,
            line: lineIndex,
            children,
          });
        } else {
          // Parse list items
          const items = this.splitListItems(value);

          for (const item of items) {
            children.push({
              value: item.trim(),
            });
          }

          this.localDefinitions.push({
            name,
            value: line.trim(),
            kind: "list",
            fileUri: uri,
            line: lineIndex,
            children,
          });
        }

        continue;
      }

      // Check for multi-line map/list definition
      const startMatch = mapStartRegex.exec(line);
      if (startMatch) {
        const name = startMatch[1].substring(1); // Remove $ prefix
        let currentLine = lineIndex + 1;
        const children: Array<{ key?: string; value: string }> = [];
        let isMap = false;
        let rawValue = line.trim();

        // Read until closing parenthesis
        while (currentLine < lines.length) {
          const mapLine = lines[currentLine].trim();
          rawValue += "\n" + mapLine;

          if (mapLine === ");") {
            break;
          }

          // Determine if it's a map by checking for key-value pairs
          if (mapLine.includes(":")) {
            isMap = true;

            // Parse the key-value pair
            const keyValueMatch = mapLine.match(
              /^\s*([\w-]+)\s*:\s*([^,]*)(?:,|$)/
            );
            if (keyValueMatch) {
              children.push({
                key: keyValueMatch[1].trim(),
                value: keyValueMatch[2].trim(),
              });
            }
          } else if (mapLine !== "" && !mapLine.startsWith("//")) {
            // It's a list item
            const listItemMatch = mapLine.match(/^\s*([^,]*)(?:,|$)/);
            if (listItemMatch) {
              children.push({
                value: listItemMatch[1].trim(),
              });
            }
          }

          currentLine++;
        }

        this.localDefinitions.push({
          name,
          value: rawValue,
          kind: isMap ? "map" : "list",
          fileUri: uri,
          line: lineIndex,
          children,
        });

        // Skip the lines we've already processed
        lineIndex = currentLine;
      }
    }
  }

  /**
   * Extracts variable references from a value string.
   *
   * @param value - The value string to check for references
   * @returns Array of referenced variable names
   */
  private extractVariableReferences(value: string): string[] {
    const references: string[] = [];

    // Match SCSS variable references ($var)
    const scssVarRegex = /\$[\w-]+/g;
    let match: RegExpExecArray | null;

    while ((match = scssVarRegex.exec(value)) !== null) {
      references.push(match[0].substring(1)); // Remove $ prefix
    }

    // Match CSS variable references (var(--var))
    const cssVarRegex = /var\(\s*--([\w-]+)\s*\)/g;

    while ((match = cssVarRegex.exec(value)) !== null) {
      references.push(match[1]);
    }

    return references;
  }

  /**
   * Splits map entries while respecting nested parentheses.
   *
   * @param mapString - The map string to split
   * @returns Array of map entries (key-value pairs)
   */
  private splitMapEntries(mapString: string): string[] {
    const entries: string[] = [];
    let current = "";
    let parenLevel = 0;

    for (let i = 0; i < mapString.length; i++) {
      const char = mapString[i];

      if (char === "(") {
        parenLevel++;
        current += char;
      } else if (char === ")") {
        parenLevel--;
        current += char;
      } else if (char === "," && parenLevel === 0) {
        entries.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      entries.push(current.trim());
    }

    return entries;
  }

  /**
   * Splits list items while respecting nested parentheses.
   *
   * @param listString - The list string to split
   * @returns Array of list items
   */
  private splitListItems(listString: string): string[] {
    const items: string[] = [];
    let current = "";
    let parenLevel = 0;

    for (let i = 0; i < listString.length; i++) {
      const char = listString[i];

      if (char === "(") {
        parenLevel++;
        current += char;
      } else if (char === ")") {
        parenLevel--;
        current += char;
      } else if (char === "," && parenLevel === 0) {
        items.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      items.push(current.trim());
    }

    return items;
  }

  /**
   * Returns the current list of local variable definitions.
   * @returns Array of local definitions
   */
  public getLocalDefinitions(): LocalDefinition[] {
    return this.localDefinitions;
  }

  /**
   * Handles cleanup when the extension is deactivated.
   */
  public dispose(): void {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
    }
    this.logger.debug("DeepScanner disposed");
  }
}
