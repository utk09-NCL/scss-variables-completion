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
}

/**
 * Gets the extension’s configuration settings from VS Code.
 *
 * @returns The configuration object for the "scssVariables" settings.
 */
export const getConfig = (): vscode.WorkspaceConfiguration => {
  // Fetch the settings under the "scssVariables" namespace.
  return vscode.workspace.getConfiguration("scssVariables");
};

/**
 * Creates a logger that writes messages to an output channel in VS Code.
 * Only logs messages if their level meets or exceeds the user’s chosen log level.
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

  // Get the user’s chosen log level from settings, defaulting to "info".
  const currentLevel = config.get<LogLevel>("logLevel", "info");

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
    } // Skip if the level isn’t high enough.

    // Get the current time in a standard format (e.g., "2025-02-23T12:00:00Z").
    const timestamp = new Date().toISOString();
    // Format the message with timestamp and level (e.g., "[2025-02-23T12:00:00Z] [INFO] Starting scan").
    const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    // Write the message to the output channel.
    outputChannel.appendLine(formattedMessage);
    // If there’s extra data, format it nicely and add it below.
    if (data) {
      outputChannel.appendLine(`  Data: ${JSON.stringify(data, null, 2)}`);
    }
  };

  // Return an object with all logging methods.
  return {
    error: (message, data) => log("error", message, data),
    warn: (message, data) => log("warn", message, data),
    info: (message, data) => log("info", message, data),
    debug: (message, data) => log("debug", message, data),
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
