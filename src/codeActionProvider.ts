import * as vscode from "vscode";
import { ScssVariable } from "./jsonLoader";
import { findClosestVariableNames } from "./utils/stringUtils";

/**
 * Code Action Provider that offers suggestions for undefined SCSS variables.
 * Provides quick fixes for typos in variable names.
 */
export class ScssVariablesCodeActionProvider
  implements vscode.CodeActionProvider
{
  private variablesMap: Map<string, ScssVariable>;

  /**
   * Creates a new code action provider.
   *
   * @param variablesMap - Map of variable names to their definitions
   */
  constructor(variablesMap: Map<string, ScssVariable>) {
    this.variablesMap = variablesMap;
  }

  /**
   * Provides code actions for the given document and range.
   *
   * @param document - The document in which the command was invoked
   * @param _range - The selected range in the editor
   * @param context - Context containing diagnostics for the given range
   * @param _token - A cancellation token
   * @returns An array of code actions
   */
  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    // Filter to only get our diagnostics about undefined variables
    const relevantDiagnostics = context.diagnostics.filter((diagnostic) =>
      diagnostic.message.includes("is not defined in the design system")
    );

    if (relevantDiagnostics.length === 0) {
      return [];
    }

    const actions: vscode.CodeAction[] = [];

    // For each relevant diagnostic, try to suggest similar variables
    for (const diagnostic of relevantDiagnostics) {
      // Extract the variable name from the diagnostic message
      const match = diagnostic.message.match(/--([^"]+)/);
      if (!match) {
        continue;
      }

      const varName = match[1];
      const allVariableNames = Array.from(this.variablesMap.keys());

      // Find similar variable names
      const similarNames = findClosestVariableNames(
        varName,
        allVariableNames,
        3 // Return top 3 suggestions
      );

      // Create code actions for each suggestion
      for (const similarName of similarNames) {
        const action = new vscode.CodeAction(
          `Replace with --${similarName}`,
          vscode.CodeActionKind.QuickFix
        );

        // Setup the edit to replace the variable
        action.edit = new vscode.WorkspaceEdit();
        action.edit.replace(document.uri, diagnostic.range, `--${similarName}`);

        action.isPreferred = similarName === similarNames[0]; // Set first suggestion as preferred
        action.diagnostics = [diagnostic]; // Associate with this diagnostic

        actions.push(action);
      }
    }

    return actions;
  }
}
