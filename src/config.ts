// src/config.ts
import * as vscode from "vscode";

/**
 * Possible log levels for the extension, from most severe (error) to least (debug).
 */
type LogLevel = "error" | "warn" | "info" | "debug";

/**
 * Interface defining the logging methods available to the extension.
 */
export interface Logger {
  /** Logs an error message, for serious problems. */
  error(message: string, data?: unknown): void;
  /** Logs a warning message, for potential issues. */
  warn(message: string, data?: unknown): void;
  /** Logs an info message, for general updates. */
  info(message: string, data?: unknown): void;
  /** Logs a debug message, for detailed troubleshooting. */
  debug(message: string, data?: unknown): void;
  /** Updates the log level from settings */
  updateLogLevel(): void;
}

/**
 * Gets the extension's configuration settings from VS Code.
 *
 * @returns The configuration object for the "scssVariables" settings.
 */
export const getConfig = (): vscode.WorkspaceConfiguration => {
  // Fetch the settings under the "scssVariables" namespace.
  return vscode.workspace.getConfiguration("scssVariables");
};

/**
 * Creates a logger that writes messages to an output channel in VS Code.
 * Only logs messages if their level meets or exceeds the user's chosen log level.
 *
 * @param outputChannel - The VS Code output panel where logs will appear.
 * @returns A logger object with methods for error, warn, info, and debug logging.
 */
export const createLogger = (outputChannel: vscode.OutputChannel): Logger => {
  // Get the current configuration settings.
  const config = getConfig();
  // Define numeric values for log levels (higher means more severe).
  const levels: Record<LogLevel, number> = {
    error: 4, // Most severe, always logged unless disabled.
    warn: 3, // Potential issues.
    info: 2, // General info (default level).
    debug: 1, // Detailed info for troubleshooting.
  };

  // Get the user's chosen log level from settings, defaulting to "info".
  let currentLevel = config.get<LogLevel>("logLevel", "info");

  /**
   * Checks if a message should be logged based on its level.
   * @param level - The level of the message (e.g., "debug").
   * @returns True if the message should be logged, false otherwise.
   */
  const shouldLog = (level: LogLevel): boolean => {
    return levels[level] >= levels[currentLevel]; // Compare numeric values.
  };

  /**
   * Logs a message with a timestamp and level, optionally with extra data.
   * @param level - The severity of the message.
   * @param message - The text to log.
   * @param data - Optional extra info to include (e.g., an error object).
   */
  const log = (level: LogLevel, message: string, data?: unknown): void => {
    if (!shouldLog(level)) {
      return;
    } // Skip if the level isn't high enough.

    // Get the current time in a standard format (e.g., "2025-02-23T12:00:00Z").
    const timestamp = new Date().toISOString();
    // Format the message with timestamp and level (e.g., "[2025-02-23T12:00:00Z] [INFO] Starting scan").
    const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    // Write the message to the output channel.
    outputChannel.appendLine(formattedMessage);
    // If there's extra data, format it nicely and add it below.
    if (data) {
      outputChannel.appendLine(`  Data: ${JSON.stringify(data, null, 2)}`);
    }
  };

  // Return an object with all logging methods.
  return {
    error: (message: string, data?: unknown): void =>
      log("error", message, data),
    warn: (message: string, data?: unknown): void => log("warn", message, data),
    info: (message: string, data?: unknown): void => log("info", message, data),
    debug: (message: string, data?: unknown): void =>
      log("debug", message, data),
    updateLogLevel: (): void => {
      currentLevel = config.get<LogLevel>("logLevel", "info");
    },
  };
};

/**
 * Gets a list of folder names to exclude when scanning the workspace.
 *
 * @returns An array of folder names (e.g., ["node_modules", "dist"]).
 */
export const getExcludedFolders = (): string[] => {
  // Get the configuration settings.
  const config = getConfig();
  // Return the user-defined excluded folders, or defaults if none are set.
  return config.get<string[]>("excludedFolders", [
    "node_modules",
    "dist",
    "build",
  ]);
};

/**
 * Gets a list of specific paths or glob patterns to scan for SCSS files.
 *
 * @returns An array of paths (e.g., ["src/styles", "components/.../*.scss"]), empty means scan all.
 */
export const getScanPaths = (): string[] => {
  // Get the configuration settings.
  const config = getConfig();
  // Return the user-defined scan paths, or an empty array (scan everything) if unset.
  return config.get<string[]>("scanPaths", []);
};

/**
 * Gets the maximum folder depth to scan when looking for SCSS files.
 *
 * @returns The maximum depth as a number (default: 30).
 */
export const getMaxScanDepth = (): number => {
  // Get the configuration settings.
  const config = getConfig();
  // Return the user-defined max depth, or 30 if not specified.
  return config.get<number>("maxScanDepth", 30);
};

/**
 * Gets the path to the JSON file containing SCSS variable definitions.
 *
 * @returns The file path as a string (default is "scssVariables.json").
 */
export const getJsonPath = (): string => {
  // Get the configuration settings.
  const config = getConfig();
  // Return the user-defined path, or the default if not set.
  return config.get<string>("path", "scssVariables.json");
};

/**
 * Gets the debounce interval for file scanning in milliseconds.
 *
 * @param defaultValue - The default value to use if not configured
 * @returns The debounce interval in milliseconds
 */
export const getDebounceInterval = (defaultValue: number): number => {
  const config = getConfig();
  return config.get<number>("debounceInterval", defaultValue);
};

/**
 * Gets patterns for excluding variables from completions.
 * Patterns can be strings (partial matches) or regular expressions.
 *
 * @returns Array of patterns to exclude from variable suggestions
 */
export const getExcludedVariablePatterns = (): (string | RegExp)[] => {
  const config = getConfig();
  const patterns = config.get<string[]>("excludedVariablePatterns", []);

  return patterns.map((pattern) => {
    // Check if it's a regular expression (enclosed in / /)
    const regexMatch = pattern.match(/^\/(.+)\/([gimsuy]*)$/);
    if (regexMatch) {
      try {
        return new RegExp(regexMatch[1], regexMatch[2]);
      } catch (err) {
        // If invalid regex, treat as a string pattern
        // eslint-disable-next-line no-console
        console.error(`Invalid regex pattern: ${pattern}`, err);
        return pattern;
      }
    }
    return pattern;
  });
};

/**
 * Determines if notifications for new local variables should be shown.
 *
 * @returns true if notifications are enabled, false otherwise (default: false).
 */
export const showLocalVariableNotifications = (): boolean => {
  const config = getConfig();
  return config.get<boolean>("showLocalVariableNotifications", false);
};

/**
 * Determines if progress notifications for workspace scans should be shown.
 *
 * @returns true if progress notifications are enabled, false otherwise (default: true).
 */
export const showScanProgress = (): boolean => {
  const config = getConfig();
  return config.get<boolean>("showScanProgress", true);
};

/**
 * Checks if diagnostics are enabled for the extension.
 * @returns True if diagnostics are enabled, false otherwise.
 */
export function diagnosticsEnabled(): boolean {
  return vscode.workspace
    .getConfiguration("scssVariables")
    .get("enableDiagnostics", true);
}

/**
 * Gets the log level for the extension.
 * @returns The log level (error, warn, info, debug).
 */
export function getLogLevel(): string {
  return vscode.workspace
    .getConfiguration("scssVariables")
    .get("logLevel", "info");
}

/**
 * Checks if HTML integration is enabled in the extension settings.
 * @returns True if HTML support is enabled, false otherwise
 */
export function isHtmlSupportEnabled(): boolean {
  return vscode.workspace
    .getConfiguration("scssVariables")
    .get("enableHtmlSupport", true);
}

/**
 * Checks if interpolated variables support is enabled.
 * @returns True if interpolated variables are supported, false otherwise
 */
export function isInterpolatedVariablesEnabled(): boolean {
  return vscode.workspace
    .getConfiguration("scssVariables")
    .get("enableInterpolatedVariables", true);
}

/**
 * Gets the maximum number of files to scan in a single batch.
 * This helps prevent memory issues in large workspaces.
 *
 * @returns The maximum number of files to scan in a batch (default: 1000)
 */
export const getMaxFilesPerBatch = (): number => {
  const config = getConfig();
  return config.get<number>("maxFilesPerBatch", 1000);
};

/**
 * Gets the delay between batch scans in milliseconds.
 * This helps prevent CPU spikes in large workspaces.
 *
 * @returns The delay between batch scans in milliseconds (default: 100)
 */
export const getBatchScanDelay = (): number => {
  const config = getConfig();
  return config.get<number>("batchScanDelay", 100);
};

/**
 * Gets whether to use parallel scanning for better performance.
 *
 * @returns true if parallel scanning is enabled (default: true)
 */
export const isParallelScanningEnabled = (): boolean => {
  const config = getConfig();
  return config.get<boolean>("enableParallelScanning", true);
};

/**
 * Gets the maximum number of parallel scan operations.
 *
 * @returns The maximum number of parallel scans (default: 4)
 */
export const getMaxParallelScans = (): number => {
  const config = getConfig();
  return config.get<number>("maxParallelScans", 4);
};

/**
 * Gets additional patterns to exclude from scanning.
 * These are in addition to the standard excluded folders.
 *
 * @returns Array of glob patterns to exclude
 */
export const getAdditionalExcludePatterns = (): string[] => {
  const config = getConfig();
  return config.get<string[]>("additionalExcludePatterns", [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.git/**",
    "**/coverage/**",
    "**/target/**",
    "**/out/**",
    "**/bin/**",
    "**/obj/**",
    "**/tmp/**",
    "**/temp/**",
    "**/vendor/**",
    "**/venv/**",
    "**/.env/**",
    "**/__pycache__/**",
    "**/.pytest_cache/**",
    "**/.mvn/**",
    "**/.gradle/**",
    "**/.idea/**",
    "**/.vscode/**"
  ]);
};

/**
 * Gets whether to use file system caching for faster subsequent scans.
 *
 * @returns true if file system caching is enabled (default: true)
 */
export const isFileSystemCachingEnabled = (): boolean => {
  const config = getConfig();
  return config.get<boolean>("enableFileSystemCaching", true);
};

/**
 * Gets the maximum file size to scan in bytes.
 * Files larger than this will be skipped.
 *
 * @returns The maximum file size in bytes (default: 1MB)
 */
export const getMaxFileSize = (): number => {
  const config = getConfig();
  return config.get<number>("maxFileSize", 1024 * 1024); // 1MB
};
