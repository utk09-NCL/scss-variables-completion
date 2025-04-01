// src/hoverProvider.ts
import * as vscode from "vscode";
import { ScssVariable } from "./jsonLoader";
import { LocalDefinition } from "./deepScanner";

/**
 * Registers a hover provider for SCSS/CSS variables that shows detailed information
 * when hovering over variable references.
 *
 * @param variablesMap - Map of design system variables loaded from JSON
 * @param localVariables - Array of locally defined variables found in the workspace
 * @returns A disposable for the hover provider registration
 */
export function registerHoverProvider(
  variablesMap: Map<string, ScssVariable>,
  localVariables: LocalDefinition[]
): vscode.Disposable {
  return vscode.languages.registerHoverProvider(
    [
      { language: "scss", scheme: "file" },
      { language: "css", scheme: "file" },
      { language: "html", scheme: "file" },
    ],
    {
      /**
       * Provides hover information for SCSS/CSS variables.
       *
       * @param document - The text document where the hover was triggered
       * @param position - The position in the document where the hover was triggered
       * @returns A Hover object containing variable information, or undefined
       */
      provideHover(
        document: vscode.TextDocument,
        position: vscode.Position
      ): vscode.Hover | undefined {
        // Get the variable name under the cursor
        const range = document.getWordRangeAtPosition(
          position,
          /--[\w-]+|var\(--[\w-]+\)|#{?\$[\w-]+}?/
        );
        if (!range) {
          return undefined;
        }

        const text = document.getText(range);
        let varName: string;

        // Extract the variable name based on its format
        if (text.startsWith("var(--")) {
          // Handle var(--variable-name)
          varName = text.substring(5, text.length - 1);
        } else if (text.startsWith("--")) {
          // Handle --variable-name
          varName = text.substring(2);
        } else if (text.startsWith("#")) {
          // Handle interpolated SCSS variables #{$variable-name}
          const match = text.match(/#{?\$([\w-]+)}?/);
          if (match) {
            varName = match[1];
          } else {
            return undefined;
          }
        } else {
          return undefined;
        }

        // Check if it's a variable from the JSON
        const variable = variablesMap.get(varName);
        if (variable) {
          return createHoverForJsonVariable(varName, variable);
        }

        // Check if it's a locally defined variable
        const localVarDefinitions = localVariables.filter(
          (def) => def.name === varName
        );
        if (localVarDefinitions.length > 0) {
          return createHoverForLocalVariable(varName, localVarDefinitions);
        }

        return undefined;
      },
    }
  );
}

/**
 * Creates hover information for a variable defined in the JSON file.
 *
 * @param name - The name of the variable
 * @param variable - The variable definition from the JSON
 * @returns A hover object with formatted content
 */
function createHoverForJsonVariable(
  name: string,
  variable: ScssVariable
): vscode.Hover {
  const markdown = new vscode.MarkdownString(undefined, true);
  markdown.isTrusted = true;
  markdown.supportHtml = true;

  markdown.appendMarkdown(`# --${name}\n\n`);
  markdown.appendMarkdown(`${variable.description || "No description"}\n\n`);

  // Format variable values (handle theme variants)
  markdown.appendMarkdown(`## Values\n\n`);

  if (typeof variable.value === "string") {
    markdown.appendMarkdown(`\`${variable.value}\`\n\n`);

    // Add color preview if it's a color value
    addColorPreview(markdown, variable.value);
  } else if (typeof variable.value === "object") {
    // Handle theme variants
    for (const [theme, value] of Object.entries(variable.value)) {
      markdown.appendMarkdown(`**${theme}**: \`${value}\`\n\n`);

      // Add color preview for each theme variant
      const valueStr = String(value);
      const colorBox = createColorBox(valueStr);
      if (colorBox) {
        markdown.appendMarkdown(`${colorBox} **${theme}** color\n\n`);
      }
    }
  }

  // Show supported CSS properties
  markdown.appendMarkdown(`## Supported CSS Properties\n\n`);
  if (
    variable.cssAttributesSupported &&
    variable.cssAttributesSupported.length > 0
  ) {
    for (const attribute of variable.cssAttributesSupported) {
      markdown.appendMarkdown(`- \`${attribute}\`\n`);
    }
  } else {
    markdown.appendMarkdown("No specific CSS properties defined.");
  }

  markdown.appendMarkdown("\n\n*Design System Variable*");

  return new vscode.Hover(markdown);
}

/**
 * Creates hover information for a locally defined variable.
 *
 * @param name - The name of the variable
 * @param definitions - The variable definitions from the workspace
 * @returns A hover object with formatted content
 */
function createHoverForLocalVariable(
  name: string,
  definitions: LocalDefinition[]
): vscode.Hover {
  const markdown = new vscode.MarkdownString(undefined, true);
  markdown.isTrusted = true;
  markdown.supportHtml = true;

  markdown.appendMarkdown(`# --${name}\n\n`);

  // Show comment if available
  const firstDef = definitions[0];
  if (firstDef.comment) {
    markdown.appendMarkdown(`${firstDef.comment}\n\n`);
  }

  // Show different info based on variable type
  if (firstDef.kind === "map" || firstDef.kind === "list") {
    // Handle maps and lists
    const typeLabel = firstDef.kind === "map" ? "Map" : "List";
    markdown.appendMarkdown(`## ${typeLabel} Definition\n\n`);

    if (firstDef.children && firstDef.children.length > 0) {
      markdown.appendCodeblock(
        firstDef.children
          .map((child) => {
            if (child.key) {
              return `${child.key}: ${child.value}`;
            }
            return child.value;
          })
          .join("\n"),
        "scss"
      );
    } else {
      markdown.appendMarkdown("*Empty*\n\n");
    }
  } else {
    // Regular variable
    markdown.appendMarkdown(`## Value\n\n`);
    markdown.appendCodeblock(firstDef.value || "undefined", "scss");

    // Add color preview if it's a color value
    if (firstDef.value) {
      const colorBox = createColorBox(firstDef.value);
      if (colorBox) {
        markdown.appendMarkdown(`${colorBox} Color preview\n\n`);
      }
    }
  }

  // Add location information with links
  markdown.appendMarkdown(`\n## Defined in\n\n`);

  for (const def of definitions) {
    const relativePath = vscode.workspace.asRelativePath(def.fileUri);
    // Create a command URI to open the file at the specific line
    const uri = vscode.Uri.parse(
      `command:vscode.open?${encodeURIComponent(
        JSON.stringify([
          def.fileUri,
          { selection: new vscode.Range(def.line, 0, def.line, 0) },
        ])
      )}`
    );

    markdown.appendMarkdown(`- [${relativePath}:${def.line + 1}](${uri})\n`);
  }

  markdown.appendMarkdown("\n\n*Local Variable*");

  return new vscode.Hover(markdown);
}

/**
 * Adds a color preview to the markdown if the value represents a color.
 *
 * @param markdown - The markdown string to append to
 * @param value - The variable value to check for colors
 */
function addColorPreview(markdown: vscode.MarkdownString, value: string): void {
  if (isColorValue(value)) {
    const colorBox = createColorBox(value);
    if (colorBox) {
      markdown.appendMarkdown(`${colorBox} Color preview\n\n`);
    }
  }
}

/**
 * Creates an HTML color box for preview.
 *
 * @param value - The color value to preview
 * @returns An HTML string for the color preview or undefined if not a valid color
 */
function createColorBox(value: string): string | undefined {
  // Extract color from the value
  const color = extractColor(value);
  if (!color) {
    return undefined;
  }

  // Create an HTML box with the color
  return `<span style="background-color:${color};width:16px;height:16px;display:inline-block;border:1px solid #ccc;margin-right:5px;vertical-align:middle;"></span>`;
}

/**
 * Checks if a value appears to be a color value.
 *
 * @param value - The value to check
 * @returns True if the value appears to be a color value
 */
function isColorValue(value: string): boolean {
  // Check for hex colors, rgb/rgba, hsl/hsla, or common color names
  return (
    /#[0-9a-fA-F]{3,8}\b/.test(value) || // Hex color anywhere in the string
    /\b(rgb|rgba|hsl|hsla)\(/.test(value) || // RGB/HSL
    /\b(black|white|gray|red|blue|green|yellow|purple|pink|orange|brown|cyan|magenta|lime|maroon|navy|olive|teal|aqua|fuchsia|silver|transparent)\b/i.test(
      value
    ) // Color names
  );
}

/**
 * Extracts a color from a string that might contain other text.
 *
 * @param value - The string that might contain a color
 * @returns The extracted color or undefined
 */
function extractColor(value: string): string | undefined {
  // Handle var() references with specific patterns
  if (value.includes("var(")) {
    // Try to extract direct hex color that might be included as a fallback
    const fallbackMatch = value.match(/var\([^,]*,\s*(#[0-9a-fA-F]{3,8})\b/);
    if (fallbackMatch && fallbackMatch[1]) {
      return fallbackMatch[1];
    }
  }

  // Try to extract a hex color
  const hexMatch = value.match(/#[0-9a-fA-F]{3,8}\b/);
  if (hexMatch) {
    return hexMatch[0];
  }

  // Try to extract rgb/rgba/hsl/hsla
  const funcColorMatch = value.match(/(rgb|rgba|hsl|hsla)\([^)]+\)/);
  if (funcColorMatch) {
    return funcColorMatch[0];
  }

  // Check for named colors
  const namedColors = [
    "red",
    "green",
    "blue",
    "yellow",
    "purple",
    "orange",
    "black",
    "white",
    "gray",
    "cyan",
    "magenta",
    "lime",
    "maroon",
    "navy",
    "olive",
    "teal",
    "aqua",
    "fuchsia",
    "silver",
    "transparent",
  ];

  for (const color of namedColors) {
    const colorRegex = new RegExp(`\\b${color}\\b`, "i");
    if (colorRegex.test(value)) {
      return color;
    }
  }

  return undefined;
}
