// src/diagnostics.ts
import * as vscode from "vscode";
import { ScssVariable } from "./jsonLoader";

/**
 * Registers diagnostics to warn about SCSS variables used in code that are either undefined
 * or used with unsupported CSS properties.
 *
 * @param variablesMap A map of SCSS variable names to their definitions.
 * @returns A disposable that cleans up the diagnostics when the extension is deactivated.
 */
export function registerDiagnostics(
  variablesMap: Map<string, ScssVariable>
): vscode.Disposable {
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection("scssVariables");

  /**
   * Analyzes a document for SCSS variable issues and updates the diagnostics collection.
   *
   * @param document The text document to analyze.
   */
  function updateDiagnostics(document: vscode.TextDocument): void {
    if (
      document.uri.scheme !== "file" ||
      !["scss", "css"].includes(document.languageId)
    ) {
      return;
    }

    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();

    // Regex to match CSS property and variable usage, e.g. "background-color: var(--varName)"
    const regex = /(?:^|\s)([\w-]+)\s*:\s*var\(--([\w-]+)\)/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const cssProperty = match[1].toLowerCase();
      const varName = match[2];
      const variable = variablesMap.get(varName);

      if (!variable) {
        // Variable not defined in the JSON.
        const startPos = document.positionAt(
          match.index + match[0].indexOf(varName)
        );
        const endPos = document.positionAt(
          match.index + match[0].indexOf(varName) + varName.length
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
        // Variable exists but is not supported for the given CSS property.
        const startPos = document.positionAt(match.index);
        const endPos = document.positionAt(match.index + match[0].length);
        diagnostics.push(
          new vscode.Diagnostic(
            new vscode.Range(startPos, endPos),
            `"--${varName}" is not supported for the "${cssProperty}" property.`,
            vscode.DiagnosticSeverity.Warning
          )
        );
      }
    }

    diagnosticCollection.set(document.uri, diagnostics);
  }

  // Listen for document changes and update diagnostics.
  const subscriptions = [
    vscode.workspace.onDidChangeTextDocument((e) =>
      updateDiagnostics(e.document)
    ),
    vscode.workspace.onDidOpenTextDocument(updateDiagnostics),
  ];

  // Update diagnostics for all open documents.
  vscode.workspace.textDocuments.forEach(updateDiagnostics);

  return vscode.Disposable.from(diagnosticCollection, ...subscriptions);
}
