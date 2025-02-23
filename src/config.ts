// src/config.ts
import * as vscode from "vscode";

/** Possible levels for logging messages, from most severe to least. */
type LogLevel = "error" | "warn" | "info" | "debug";

/** Describes a logger with methods for different log levels. */
export interface Logger {
  error(message: string, data?: unknown): void; // For serious problems.
  warn(message: string, data?: unknown): void; // For potential issues.
  info(message: string, data?: unknown): void; // For general updates.
  debug(message: string, data?: unknown): void; // For detailed troubleshooting.
}

/**
 * Gets the extension’s settings from VS Code.
 *
 * @returns The configuration object with all "scssVariables" settings.
 */
export const getConfig = (): vscode.WorkspaceConfiguration =>
  vscode.workspace.getConfiguration("scssVariables");

/**
 * Creates a logger that writes messages to an output panel in VS Code.
 * Only logs messages based on the user’s chosen log level in settings.
 *
 * @param outputChannel - The VS Code panel where logs will appear.
 * @returns A logger object with methods for each log level.
 */
export const createLogger = (outputChannel: vscode.OutputChannel): Logger => {
  const config = getConfig(); // Get the current settings.
  // Define numeric values for each log level (higher = more severe).
  const levels: Record<LogLevel, number> = {
    error: 4,
    warn: 3,
    info: 2,
    debug: 1,
  };

  // Get the user’s chosen log level (defaults to "info").
  const currentLevel = config.get<LogLevel>("logLevel", "info");

  // Helper function to decide if a message should be logged.
  const shouldLog = (level: LogLevel): boolean =>
    levels[level] >= levels[currentLevel]; // Log if the message’s level meets or exceeds the setting.

  // Helper function to format and write a log message.
  const log = (level: LogLevel, message: string, data?: unknown): void => {
    if (!shouldLog(level)) {
      return; // Skip if the level isn’t high enough.
    }

    const timestamp = new Date().toISOString(); // Get the current time.
    // Format the message with timestamp and level.
    const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    outputChannel.appendLine(formattedMessage); // Write the message to the panel.
    if (data) {
      // If extra data is provided, add it nicely formatted.
      outputChannel.appendLine(`  Data: ${JSON.stringify(data, null, 2)}`);
    }
  };

  // Return the logger object with all four methods.
  return {
    error: (message, data) => log("error", message, data),
    warn: (message, data) => log("warn", message, data),
    info: (message, data) => log("info", message, data),
    debug: (message, data) => log("debug", message, data),
  };
};

/**
 * Gets the list of folders to ignore when scanning files.
 *
 * @returns An array of folder names (e.g., ["node_modules", "dist"]).
 */
export const getExcludedFolders = (): string[] => {
  const config = vscode.workspace.getConfiguration("scssVariables");
  // Return the user’s excluded folders or the defaults.
  return config.get<string[]>("excludedFolders", [
    "node_modules",
    "dist",
    "build",
  ]);
};
