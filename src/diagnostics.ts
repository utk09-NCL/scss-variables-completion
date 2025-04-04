// src/diagnostics.ts
import * as vscode from "vscode";
import { ScssVariable } from "./jsonLoader";
import { showLocalVariableNotifications, isHtmlSupportEnabled } from "./config";

/**
 * Registers diagnostics to warn about SCSS variable issues in the workspace.
 * Checks for:
 * - Variables used but not defined in JSON (from SCSS/CSS files).
 * - Variables used with unsupported CSS properties.
 * - Optionally shows notifications for local variables not in JSON if configured.
 *
 * @param variablesMap - A map of JSON-defined variable names to their definitions.
 * @returns A disposable to clean up diagnostics when the extension stops.
 */
export function registerDiagnostics(
  variablesMap: Map<string, ScssVariable>
): vscode.Disposable {
  // Create a collection for displaying warnings in the Problems panel.
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection("scssVariables");

  /**
   * Updates diagnostics for a specific file by checking variable usage.
   *
   * @param document - The SCSS/CSS file to analyze.
   */
  function updateDiagnostics(document: vscode.TextDocument): void {
    // Only check actual SCSS, CSS, or HTML files (not virtual/unsaved ones).
    if (document.uri.scheme !== "file") {
      return;
    }

    const supportedLanguageIds = ["scss", "css"];

    // Add HTML support if enabled
    if (isHtmlSupportEnabled() && document.languageId === "html") {
      supportedLanguageIds.push("html");
    }

    if (!supportedLanguageIds.includes(document.languageId)) {
      return;
    }

    // Array to hold all warnings.
    const diagnostics: vscode.Diagnostic[] = [];
    // Get the full text of the file.
    const text = document.getText();
    // Sets to track local definitions and used variables.
    const localVars = new Set<string>();
    const usedVars = new Set<string>();

    try {
      // Collect local definitions (e.g., "--my-var: value;").
      const localVarRegex = /--([\w-]+)\s*:/g;
      let localMatch: RegExpExecArray | null;
      while ((localMatch = localVarRegex.exec(text)) !== null) {
        localVars.add(localMatch[1]);
      }

      // Check for variable usage (e.g., "color: var(--my-var)").
      // Enhanced regex to handle more complex variable usage patterns
      const usageRegex =
        /(?:^|\s)([\w-]+)\s*:\s*var\(\s*--([\w-]+)(?:\s*,\s*([^)]+))?\s*\)/g;
      let match: RegExpExecArray | null;
      while ((match = usageRegex.exec(text)) !== null) {
        const cssProperty = match[1].toLowerCase(); // The CSS property (e.g., "color").
        const varName = match[2]; // The variable name (e.g., "my-var").
        usedVars.add(varName); // Track that this variable was used.

        if (localVars.has(varName)) {
          continue;
        } // Skip local variables (no JSON check needed).

        const variable = variablesMap.get(varName); // Look up in JSON.
        // Calculate the range of the variable name in the text.
        const startPos = document.positionAt(
          match.index + match[0].indexOf(`--${varName}`)
        );
        const endPos = document.positionAt(
          match.index + match[0].indexOf(`--${varName}`) + varName.length + 2 // +2 for "--"
        );

        if (!variable) {
          // If the variable isn't in JSON, warn that it's undefined.
          diagnostics.push(
            new vscode.Diagnostic(
              new vscode.Range(startPos, endPos),
              `SCSS variable "--${varName}" is not defined in the design system.`,
              vscode.DiagnosticSeverity.Warning
            )
          );
        } else if (
          !variable.cssAttributesSupported
            .map((attr) => attr.toLowerCase())
            .includes(cssProperty)
        ) {
          // If it's used with an unsupported property, warn about misuse.
          diagnostics.push(
            new vscode.Diagnostic(
              new vscode.Range(
                document.positionAt(match.index),
                document.positionAt(match.index + match[0].length)
              ),
              `"--${varName}" is not supported for the "${cssProperty}" property.`,
              vscode.DiagnosticSeverity.Warning
            )
          );
        }
      }

      // HTML-specific variable detection (if enabled and it's an HTML file)
      if (isHtmlSupportEnabled() && document.languageId === "html") {
        // Look for CSS variable usage in style attributes
        const styleAttrRegex = /style\s*=\s*["']([^"']+)["']/g;
        while ((match = styleAttrRegex.exec(text)) !== null) {
          const styleContent = match[1];

          // Look for variable usage within the style attribute
          const styleVarRegex =
            /([\w-]+)\s*:\s*var\(\s*--([\w-]+)(?:\s*,\s*([^)]+))?\s*\)/g;
          let styleMatch: RegExpExecArray | null;

          while ((styleMatch = styleVarRegex.exec(styleContent)) !== null) {
            const cssProperty = styleMatch[1].toLowerCase();
            const varName = styleMatch[2];
            usedVars.add(varName);

            // Skip local variables
            if (localVars.has(varName)) {
              continue;
            }

            const variable = variablesMap.get(varName);

            // Calculate absolute positions within the document
            const styleStart = match.index + match[0].indexOf(styleContent);
            const varPos =
              styleStart +
              styleMatch.index +
              styleMatch[0].indexOf(`--${varName}`);

            const startPos = document.positionAt(varPos);
            const endPos = document.positionAt(varPos + varName.length + 2); // +2 for "--"

            if (!variable) {
              diagnostics.push(
                new vscode.Diagnostic(
                  new vscode.Range(startPos, endPos),
                  `SCSS variable "--${varName}" is not defined in the design system.`,
                  vscode.DiagnosticSeverity.Warning
                )
              );
            } else if (
              !variable.cssAttributesSupported
                .map((attr) => attr.toLowerCase())
                .includes(cssProperty)
            ) {
              diagnostics.push(
                new vscode.Diagnostic(
                  new vscode.Range(
                    document.positionAt(styleStart + styleMatch.index),
                    document.positionAt(
                      styleStart + styleMatch.index + styleMatch[0].length
                    )
                  ),
                  `"--${varName}" is not supported for the "${cssProperty}" property.`,
                  vscode.DiagnosticSeverity.Warning
                )
              );
            }
          }
        }
      }

      // Optionally check for and notify about local variables not in JSON, only if enabled.
      if (showLocalVariableNotifications()) {
        localVars.forEach((varName) => {
          if (!variablesMap.has(varName) && usedVars.has(varName)) {
            // Find where this local variable is defined.
            const regex = new RegExp(`--${varName}\\s*:`);
            const match = regex.exec(text);
            if (match) {
              const startPos = document.positionAt(match.index);
              const endPos = document.positionAt(match.index + match[0].length);
              // Add an info diagnostic for local vars not in JSON.
              diagnostics.push(
                new vscode.Diagnostic(
                  new vscode.Range(startPos, endPos),
                  `Local SCSS variable "--${varName}" is used but not defined in the design system JSON.`,
                  vscode.DiagnosticSeverity.Information
                )
              );
              // Show a notification suggesting to add it to JSON.
              vscode.window.showInformationMessage(
                `New local variable "--${varName}" found in ${document.uri.fsPath}. Consider adding it to scssVariables.json.`
              );
            }
          }
        });
      }
    } catch (error) {
      // Log the error but don't crash the extension
      // eslint-disable-next-line no-console
      console.error(`Error in diagnostics for ${document.uri.fsPath}:`, error);

      // Create a diagnostic to inform the user about the error
      diagnostics.push(
        new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 0),
          `Error analyzing SCSS variables: ${(error as Error).message}`,
          vscode.DiagnosticSeverity.Error
        )
      );
    }

    diagnosticCollection.set(document.uri, diagnostics);
  }

  const subscriptions = [
    vscode.workspace.onDidChangeTextDocument((e) =>
      updateDiagnostics(e.document)
    ),
    vscode.workspace.onDidOpenTextDocument(updateDiagnostics),
  ];

  // Check all currently open files immediately.
  vscode.workspace.textDocuments.forEach(updateDiagnostics);
  // Return a cleanup object for the collection and listeners.
  return vscode.Disposable.from(diagnosticCollection, ...subscriptions);
}
