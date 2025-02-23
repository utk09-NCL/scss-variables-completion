// src/diagnostics.ts
import * as vscode from "vscode";
import { ScssVariable } from "./jsonLoader";

/**
 * Sets up warnings in VS Code for SCSS variables that are used but not defined,
 * or used with the wrong CSS properties.
 *
 * @param variablesMap - A map of JSON-defined variable names to their details.
 * @returns A disposable to clean up when the extension stops.
 */
export function registerDiagnostics(
  variablesMap: Map<string, ScssVariable>
): vscode.Disposable {
  // Create a collection for showing warnings.
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection("scssVariables");

  /**
   * Checks a file for variable usage problems and adds warnings.
   *
   * @param document - The file to check.
   */
  function updateDiagnostics(document: vscode.TextDocument): void {
    // Only check SCSS or CSS files that are actual files (not virtual).
    if (
      document.uri.scheme !== "file" ||
      !["scss", "css"].includes(document.languageId)
    ) {
      return;
    }

    const diagnostics: vscode.Diagnostic[] = []; // List of warnings.
    const text = document.getText(); // Get all text in the file.

    // Find all locally defined CSS variables (e.g., "--my-var: value;").
    const localVarRegex = /--([\w-]+)\s*:/g;
    const localVars = new Set<string>();
    let localMatch: RegExpExecArray | null;
    while ((localMatch = localVarRegex.exec(text)) !== null) {
      localVars.add(localMatch[1]); // Add each local variable to the set.
    }

    // Look for uses of variables like "color: var(--my-var)".
    const regex = /(?:^|\s)([\w-]+)\s*:\s*var\(--([\w-]+)\s*\)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const cssProperty = match[1].toLowerCase(); // The property (e.g., "color").
      const varName = match[2]; // The variable name (e.g., "my-var").

      // Skip if the variable is defined locally in this file.
      if (localVars.has(varName)) {
        continue;
      }

      const variable = variablesMap.get(varName); // Get JSON definition if it exists.
      if (!variable) {
        // If it’s not defined in JSON, warn about it.
        const startPos = document.positionAt(
          match.index + match[0].indexOf(varName) // Where the variable name starts.
        );
        const endPos = document.positionAt(
          match.index + match[0].indexOf(varName) + varName.length // Where it ends.
        );
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
        // If it’s defined but not allowed for this property, warn.
        const startPos = document.positionAt(match.index); // Start of the whole rule.
        const endPos = document.positionAt(match.index + match[0].length); // End of it.
        diagnostics.push(
          new vscode.Diagnostic(
            new vscode.Range(startPos, endPos),
            `"--${varName}" is not supported for the "${cssProperty}" property.`,
            vscode.DiagnosticSeverity.Warning
          )
        );
      }
    }

    // Apply the warnings to this file.
    diagnosticCollection.set(document.uri, diagnostics);
  }

  // Set up listeners to update warnings when files change or open.
  const subscriptions = [
    vscode.workspace.onDidChangeTextDocument((e) =>
      updateDiagnostics(e.document)
    ),
    vscode.workspace.onDidOpenTextDocument(updateDiagnostics),
  ];

  // Check all currently open files right away.
  vscode.workspace.textDocuments.forEach(updateDiagnostics);
  // Return a cleanup object for all resources.
  return vscode.Disposable.from(diagnosticCollection, ...subscriptions);
}
