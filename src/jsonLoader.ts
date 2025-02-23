// src/jsonLoader.ts
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

/** Defines what an SCSS variable looks like in the JSON file. */
export type ScssVariable = {
  value: Record<string, string>; // Values like {"light": "#fff", "dark": "#000"}.
  description: string; // What the variable is for.
  cssAttributesSupported: string[]; // CSS properties it works with (e.g., ["color"]).
};

/** Maps CSS properties to sets of variable names that support them. */
export type CssAttributeMap = Map<string, Set<string>>;

type JsonData = {
  [key: string]: ScssVariable; // The JSON structure: variable names to their details.
};

/**
 * Loads SCSS variables from a JSON file specified in settings.
 *
 * @returns An object with two maps: one for variables and one for CSS properties.
 */
export async function loadScssVariables(): Promise<{
  variablesMap: Map<string, ScssVariable>;
  cssAttributeMap: CssAttributeMap;
}> {
  const config = vscode.workspace.getConfiguration("scssVariables");
  const jsonFilePath: string = config.get("path", "scssVariables.json"); // Default file name.

  const workspaceFolders = vscode.workspace.workspaceFolders; // Get all open folders.
  if (!workspaceFolders) {
    // If no workspace, return empty maps.
    return { variablesMap: new Map(), cssAttributeMap: new Map() };
  }

  const variablesMap: Map<string, ScssVariable> = new Map(); // Store variables here.
  const cssAttributeMap: CssAttributeMap = new Map(); // Store property-to-variable mappings.

  // Check each workspace folder for the JSON file.
  for (const folder of workspaceFolders) {
    const fullPath = path.join(folder.uri.fsPath, jsonFilePath); // Build the full file path.

    try {
      const rawData: string = await fs.promises.readFile(fullPath, "utf8"); // Read the file.
      const jsonData: JsonData = JSON.parse(rawData); // Parse it into an object.

      // Process each variable in the JSON.
      for (const [varName, variable] of Object.entries(jsonData)) {
        if (!validateVariable(variable)) {
          continue; // Skip if the variable isn’t valid.
        }
        variablesMap.set(varName, variable); // Add to the map.

        // Link the variable to its supported CSS properties.
        for (const attr of variable.cssAttributesSupported) {
          const normalizedAttr = attr.toLowerCase(); // Standardize to lowercase.
          if (!cssAttributeMap.has(normalizedAttr)) {
            cssAttributeMap.set(normalizedAttr, new Set()); // Start a new set if needed.
          }
          cssAttributeMap.get(normalizedAttr)?.add(varName); // Add the variable name.
        }
      }
    } catch (err) {
      // Warn if the file can’t be loaded, but keep going.
      vscode.window.showWarningMessage(
        `Failed to load SCSS variables from ${fullPath}: ${err}`
      );
    }
  }

  return { variablesMap, cssAttributeMap }; // Return both maps.
}

/**
 * Checks if a variable from the JSON is correctly structured.
 *
 * @param variable - The variable object to check.
 * @returns True if it matches the ScssVariable type, false otherwise.
 */
function validateVariable(variable: unknown): variable is ScssVariable {
  if (!variable || typeof variable !== "object") {
    return false; // Must be an object.
  }
  const varObj = variable as ScssVariable;
  // Check all required fields and their types.
  return (
    typeof varObj.description === "string" &&
    typeof varObj.value === "object" &&
    Array.isArray(varObj.cssAttributesSupported) &&
    varObj.cssAttributesSupported.every((attr) => typeof attr === "string")
  );
}
