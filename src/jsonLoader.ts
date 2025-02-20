// src/jsonLoader.ts
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

/**
 * Represents a SCSS variable definition.
 */
export type ScssVariable = {
  /** The set of values (e.g. dark, light themes) for the variable. */
  value: Record<string, string>;
  /** A description of the variable. */
  description: string;
  /** A list of CSS attributes where this variable can be applied. */
  cssAttributesSupported: string[];
};

/**
 * A map associating CSS attribute names (lowercase) to a set of SCSS variable names.
 */
export type CssAttributeMap = Map<string, Set<string>>;

type JsonData = {
  [key: string]: ScssVariable;
};

/**
 * Loads SCSS variables from a JSON file defined in the extension settings.
 *
 * @returns A promise that resolves to an object containing:
 *  - variablesMap: a map of variable names to their definitions.
 *  - cssAttributeMap: a map from CSS attributes to sets of variable names.
 */
export async function loadScssVariables(): Promise<{
  variablesMap: Map<string, ScssVariable>;
  cssAttributeMap: CssAttributeMap;
}> {
  const config = vscode.workspace.getConfiguration("scssVariables");
  const jsonFilePath: string = config.get("path", "scssVariables.json");

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return { variablesMap: new Map(), cssAttributeMap: new Map() };
  }

  const variablesMap: Map<string, ScssVariable> = new Map();
  const cssAttributeMap: CssAttributeMap = new Map();

  // Load the JSON file from each workspace folder (supports multi-root).
  for (const folder of workspaceFolders) {
    const fullPath = path.join(folder.uri.fsPath, jsonFilePath);

    try {
      const rawData: string = await fs.promises.readFile(fullPath, "utf8");
      const jsonData: JsonData = JSON.parse(rawData);

      // Validate and process each SCSS variable.
      for (const [varName, variable] of Object.entries(jsonData)) {
        if (!validateVariable(variable)) {
          continue;
        }
        variablesMap.set(varName, variable);

        // Build a map of CSS attributes to variable names.
        for (const attr of variable.cssAttributesSupported) {
          const normalizedAttr = attr.toLowerCase();
          if (!cssAttributeMap.has(normalizedAttr)) {
            cssAttributeMap.set(normalizedAttr, new Set());
          }
          cssAttributeMap.get(normalizedAttr)?.add(varName);
        }
      }
    } catch (err) {
      // Show a warning if the file fails to load, but continue processing.
      vscode.window.showWarningMessage(
        `Failed to load SCSS variables from ${fullPath}: ${err}`
      );
    }
  }

  return { variablesMap, cssAttributeMap };
}

/**
 * Validates that the given variable conforms to the ScssVariable interface.
 *
 * @param variable The variable object to validate.
 * @returns True if valid; otherwise, false.
 */
function validateVariable(variable: unknown): variable is ScssVariable {
  if (!variable || typeof variable !== "object") {
    return false;
  }
  const varObj = variable as ScssVariable;
  return (
    typeof varObj.description === "string" &&
    typeof varObj.value === "object" &&
    Array.isArray(varObj.cssAttributesSupported) &&
    varObj.cssAttributesSupported.every((attr) => typeof attr === "string")
  );
}
