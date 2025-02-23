// src/jsonLoader.ts
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

/**
 * Defines the structure of an SCSS variable as stored in the JSON file.
 */
export type ScssVariable = {
  value: Record<string, string>; // Values for different themes/sizes (e.g., {"light": "#fff"}).
  description: string; // A description of what the variable is for.
  cssAttributesSupported: string[]; // CSS properties this variable can be used with.
};

/**
 * A map linking CSS property names (lowercase) to sets of variable names that support them.
 */
export type CssAttributeMap = Map<string, Set<string>>;

/**
 * Type for the raw JSON data, mapping variable names to their definitions.
 */
type JsonData = {
  [key: string]: ScssVariable;
};

/**
 * Loads SCSS variables from a JSON file specified in the extension settings.
 * Builds two maps: one for variables and one for CSS property support.
 *
 * @returns A promise resolving to an object with:
 *  - variablesMap: Map of variable names to their definitions.
 *  - cssAttributeMap: Map of CSS properties to variable names.
 */
export async function loadScssVariables(): Promise<{
  variablesMap: Map<string, ScssVariable>;
  cssAttributeMap: CssAttributeMap;
}> {
  // Get the extension’s settings.
  const config = vscode.workspace.getConfiguration("scssVariables");
  // Get the JSON file path from settings, defaulting to "scssVariables.json".
  const jsonFilePath: string = config.get("path", "scssVariables.json");

  // Get all open workspace folders (supports multi-root workspaces).
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    // If no workspace is open, warn the user and return empty maps.
    vscode.window.showWarningMessage(
      "No workspace folder open. Please open a workspace to load SCSS variables."
    );
    return { variablesMap: new Map(), cssAttributeMap: new Map() };
  }

  // Create maps to store the loaded data.
  const variablesMap: Map<string, ScssVariable> = new Map();
  const cssAttributeMap: CssAttributeMap = new Map();

  // Process each workspace folder to find the JSON file.
  for (const folder of workspaceFolders) {
    // Build the full path to the JSON file in this folder.
    const fullPath = path.join(folder.uri.fsPath, jsonFilePath);
    try {
      // Read the JSON file as a string.
      const rawData: string = await fs.promises.readFile(fullPath, "utf8");
      let jsonData: JsonData;

      try {
        // Parse the string into a JavaScript object.
        jsonData = JSON.parse(rawData);
      } catch (parseErr) {
        // If parsing fails, show an error with guidance.
        const errorMsg =
          parseErr instanceof Error ? parseErr.message : String(parseErr);
        vscode.window.showErrorMessage(
          `Failed to parse ${fullPath}: Invalid JSON format. Check for syntax errors (e.g., missing commas or brackets). Error: ${errorMsg}`
        );
        continue; // Skip to the next folder.
      }

      // Process each variable in the JSON data.
      for (const [varName, variable] of Object.entries(jsonData)) {
        // Validate that the variable matches the expected structure.
        if (!validateVariable(variable)) {
          vscode.window.showWarningMessage(
            `Invalid variable "${varName}" in ${fullPath}: Must have "description" (string), "value" (object), and "cssAttributesSupported" (array of strings).`
          );
          continue; // Skip invalid variables.
        }
        // Add the valid variable to the map.
        variablesMap.set(varName, variable);

        // Map each supported CSS property to this variable.
        for (const attr of variable.cssAttributesSupported) {
          const normalizedAttr = attr.toLowerCase(); // Standardize to lowercase.
          if (!cssAttributeMap.has(normalizedAttr)) {
            cssAttributeMap.set(normalizedAttr, new Set()); // Create a new set if needed.
          }
          cssAttributeMap.get(normalizedAttr)?.add(varName); // Add the variable name.
        }
      }
    } catch (err) {
      // Handle file read errors (e.g., file missing or no permissions).
      const errorMsg = err instanceof Error ? err.message : String(err);
      vscode.window.showWarningMessage(
        `Failed to load SCSS variables from ${fullPath}: File not found or inaccessible. Ensure the file exists and you have read permissions. Error: ${errorMsg}`
      );
    }
  }

  // Return the populated maps.
  return { variablesMap, cssAttributeMap };
}

/**
 * Validates that a variable object from the JSON matches the expected structure.
 *
 * @param variable - The object to check.
 * @returns True if it’s a valid ScssVariable, false otherwise.
 */
function validateVariable(variable: unknown): variable is ScssVariable {
  // Check if it’s an object and not null.
  if (!variable || typeof variable !== "object") {
    return false;
  }

  // Cast to ScssVariable type for checking properties.
  const varObj = variable as ScssVariable;
  // Ensure all required fields are present and have the right types.
  return (
    typeof varObj.description === "string" &&
    typeof varObj.value === "object" &&
    !Array.isArray(varObj.value) && // Value should be an object, not an array.
    Array.isArray(varObj.cssAttributesSupported) &&
    varObj.cssAttributesSupported.every((attr) => typeof attr === "string")
  );
}
