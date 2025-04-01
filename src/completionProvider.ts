// src/completionProvider.ts
import * as vscode from "vscode";
import { ScssVariable } from "./jsonLoader";
import { LocalDefinition } from "./deepScanner";
import { getExcludedVariablePatterns, isHtmlSupportEnabled } from "./config";
import { Trie } from "./trie";
import { onVariablesRefreshed, RefreshEvent } from "./extension";

/**
 * Manages variable completion for CSS properties, providing smart suggestions for SCSS variables.
 *
 * @param variablesMap - Map of design system variables from the JSON file
 * @param localVariables - Array of locally defined variables found in the workspace scan
 * @returns A disposable object with the registered completion provider
 */
export function registerCompletionProvider(
  variablesMap: Map<string, ScssVariable>,
  localVariables: LocalDefinition[]
): vscode.Disposable {
  // Create Trie data structures for efficient lookup and searching
  const designSystemVariableTrie = new Trie();
  const localVariableTrie = new Trie();

  // Build the tries with variable names
  function buildTries(): void {
    // Clear existing tries
    designSystemVariableTrie.clear();
    localVariableTrie.clear();

    // Rebuild with current variables
    for (const varName of variablesMap.keys()) {
      designSystemVariableTrie.insert(varName);
    }

    for (const localVar of localVariables) {
      localVariableTrie.insert(localVar.name);
    }
  }

  // Initial build
  buildTries();

  // Subscribe to variable refresh events
  const refreshSubscription = onVariablesRefreshed((event: RefreshEvent) => {
    // Update our reference to the variables
    variablesMap = event.variablesMap;
    localVariables = event.localVariables;

    // Rebuild the tries with updated data
    buildTries();
  });

  // Get the excluded variable patterns from settings
  const excludedPatterns = getExcludedVariablePatterns();

  /**
   * Checks if a variable should be excluded from completion based on settings
   *
   * @param varName - The variable name to check
   * @returns true if the variable should be excluded, false otherwise
   */
  const shouldExcludeVariable = (varName: string): boolean => {
    for (const pattern of excludedPatterns) {
      if (typeof pattern === "string") {
        if (varName.includes(pattern)) {
          return true;
        }
      } else if (pattern instanceof RegExp) {
        if (pattern.test(varName)) {
          return true;
        }
      }
    }
    return false;
  };

  // Register the completion provider for SCSS, CSS, and optionally HTML files
  const supportedLanguages = [
    { language: "scss", scheme: "file" },
    { language: "css", scheme: "file" },
  ];

  // Add HTML support if enabled in settings
  if (isHtmlSupportEnabled()) {
    supportedLanguages.push({ language: "html", scheme: "file" });
  }

  // Register the completion provider with VS Code
  const completionProviderDisposable =
    vscode.languages.registerCompletionItemProvider(
      supportedLanguages,
      {
        /**
         * Provides completion items for variables in CSS properties.
         *
         * @param document - The text document where completion was requested
         * @param position - The position in the document where completion was requested
         * @param token - A cancellation token
         * @param context - The completion context
         * @returns An array of completion items or a completion list
         */
        provideCompletionItems(
          document: vscode.TextDocument,
          position: vscode.Position,
          token: vscode.CancellationToken,
          context: vscode.CompletionContext
        ): vscode.ProviderResult<
          vscode.CompletionItem[] | vscode.CompletionList
        > {
          const linePrefix = document
            .lineAt(position)
            .text.substring(0, position.character);

          // Only provide completions after var(-- or when forcefully triggered
          const varPrefixPattern = /var\s*\(\s*--\s*([a-zA-Z0-9-_]*)$/;
          const varStartMatch = linePrefix.match(varPrefixPattern);

          if (
            !varStartMatch &&
            context.triggerKind !== vscode.CompletionTriggerKind.Invoke
          ) {
            return undefined;
          }

          // Extract the current CSS property if available
          const cssPropertyPattern = /([a-zA-Z-]+)\s*:\s*[^;]*$/;
          const propertyMatch = linePrefix.match(cssPropertyPattern);
          const currentProperty = propertyMatch ? propertyMatch[1] : undefined;

          // Extract any partial variable name already typed
          let partialVarName = "";
          if (varStartMatch && varStartMatch[1]) {
            partialVarName = varStartMatch[1];
          }

          const completionItems: vscode.CompletionItem[] = [];

          // Add design system variables from JSON
          if (variablesMap.size > 0) {
            // Use Trie for efficient prefix matching
            const matchingVarNames = partialVarName
              ? designSystemVariableTrie.find(partialVarName)
              : designSystemVariableTrie.getAllWords();

            for (const varName of matchingVarNames) {
              if (shouldExcludeVariable(varName)) {
                continue; // Skip excluded variables
              }

              const variable = variablesMap.get(varName);

              // Skip if variable is undefined (shouldn't happen)
              if (!variable) {
                continue;
              }

              // If a specific CSS property is being edited, filter variables that support it
              if (
                currentProperty &&
                variable.cssAttributesSupported &&
                !variable.cssAttributesSupported.includes(currentProperty)
              ) {
                continue;
              }

              const completionItem = new vscode.CompletionItem(
                `[Design System] ${varName}`,
                vscode.CompletionItemKind.Variable
              );

              // Format the detail text based on variable value structure
              let detailText: string;
              if (typeof variable.value === "string") {
                detailText = `Value: ${variable.value}`;
              } else {
                const variants = Object.entries(variable.value);
                detailText = variants
                  .map(([theme, value]) => `${theme}: ${value}`)
                  .join(", ");
              }

              // Configure completion item display and behavior
              completionItem.detail = detailText;

              // Add color preview if it's likely a color value
              if (
                (typeof variable.value === "string" &&
                  isColorValue(variable.value)) ||
                (typeof variable.value === "object" &&
                  Object.values(variable.value).some((value) =>
                    isColorValue(String(value))
                  ))
              ) {
                const hexColors: { color: string; variant?: string }[] = [];
                if (typeof variable.value === "string") {
                  const segments = (variable.value as string)
                    .split(",")
                    .map((s) => s.trim());
                  segments.forEach((segment) => {
                    const hexMatch = segment.match(/#[0-9a-fA-F]{3,8}\b/);
                    if (hexMatch) {
                      hexColors.push({ color: hexMatch[0] });
                    }
                  });
                } else {
                  for (const [variant, val] of Object.entries(variable.value)) {
                    const segments = String(val)
                      .split(",")
                      .map((s) => s.trim());
                    segments.forEach((segment) => {
                      const hexMatch = segment.match(/#[0-9a-fA-F]{3,8}\b/);
                      if (hexMatch) {
                        hexColors.push({ color: hexMatch[0], variant });
                      }
                    });
                  }
                }
                // If we found hex colors, add them to the completion item
                if (hexColors.length > 0) {
                  // Use CompletionItemKind.Color to show color preview in dropdown
                  completionItem.kind = vscode.CompletionItemKind.Color;

                  // Set label with prefix and color preview
                  completionItem.label = `[Design System] ${varName}`;
                  completionItem.detail = hexColors[0].color; // Show the first color in the label description to trigger the color preview in the dropdown

                  // Create hover documentation with both color previews
                  const colorMarkdown = new vscode.MarkdownString();
                  colorMarkdown.supportHtml = true;

                  // Add description in bold
                  if (variable.description) {
                    colorMarkdown.appendMarkdown(
                      `**${variable.description}**\n\n`
                    );
                  }

                  // Add values
                  colorMarkdown.appendMarkdown(`## Values\n\n`);
                  if (typeof variable.value === "string") {
                    colorMarkdown.appendMarkdown(`${variable.value}\n\n`);
                  } else {
                    for (const [theme, value] of Object.entries(
                      variable.value
                    )) {
                      colorMarkdown.appendMarkdown(
                        `**${theme}**: ${value}\n\n`
                      );
                    }
                  }

                  // Add color previews
                  colorMarkdown.appendMarkdown(`## Color Previews\n\n`);
                  hexColors.forEach(({ color, variant }) => {
                    const variantText = variant ? `**${variant}**: ` : "";
                    colorMarkdown.appendMarkdown(
                      `<span style="display:inline-block;width:24px;height:24px;background:${color};border:1px solid #ccc;margin-right:8px;vertical-align:middle;"></span> ${variantText}${color}\n\n`
                    );
                  });

                  // Add CSS attributes supported if available
                  if (
                    variable.cssAttributesSupported &&
                    variable.cssAttributesSupported.length > 0
                  ) {
                    colorMarkdown.appendMarkdown(
                      `## CSS Attributes Supported\n\n`
                    );
                    colorMarkdown.appendMarkdown(
                      variable.cssAttributesSupported.join(", ")
                    );
                  }

                  // Set documentation for hover
                  completionItem.documentation = colorMarkdown;
                } else {
                  // No colors, just the label and description
                  completionItem.label = `[Design System] ${varName}`;
                  const noColorMarkdown = new vscode.MarkdownString();
                  if (variable.description) {
                    noColorMarkdown.appendMarkdown(
                      `**${variable.description}**\n\n`
                    );
                  }
                  noColorMarkdown.appendMarkdown(`## Values\n\n`);
                  if (typeof variable.value === "string") {
                    noColorMarkdown.appendMarkdown(`${variable.value}\n\n`);
                  } else {
                    for (const [theme, value] of Object.entries(
                      variable.value
                    )) {
                      noColorMarkdown.appendMarkdown(
                        `**${theme}**: ${value}\n\n`
                      );
                    }
                  }
                  if (
                    variable.cssAttributesSupported &&
                    variable.cssAttributesSupported.length > 0
                  ) {
                    noColorMarkdown.appendMarkdown(
                      `## CSS Attributes Supported\n\n`
                    );
                    noColorMarkdown.appendMarkdown(
                      variable.cssAttributesSupported.join(", ")
                    );
                  }
                  completionItem.documentation = noColorMarkdown;
                  completionItem.documentation.supportHtml = true;
                }
              } else {
                // For non-color variables
                const nonColorMarkdown = new vscode.MarkdownString();
                if (variable.description) {
                  nonColorMarkdown.appendMarkdown(
                    `**${variable.description}**\n\n`
                  );
                }
                nonColorMarkdown.appendMarkdown(`## Values\n\n`);
                if (typeof variable.value === "string") {
                  nonColorMarkdown.appendMarkdown(`${variable.value}\n\n`);
                } else {
                  for (const [theme, value] of Object.entries(variable.value)) {
                    nonColorMarkdown.appendMarkdown(
                      `**${theme}**: ${value}\n\n`
                    );
                  }
                }
                if (
                  variable.cssAttributesSupported &&
                  variable.cssAttributesSupported.length > 0
                ) {
                  nonColorMarkdown.appendMarkdown(
                    `## CSS Attributes Supported\n\n`
                  );
                  nonColorMarkdown.appendMarkdown(
                    variable.cssAttributesSupported.join(", ")
                  );
                }
                completionItem.documentation = nonColorMarkdown;
                completionItem.documentation.supportHtml = true;
              }

              // Handle snippets and insertText
              if (varStartMatch) {
                // Only add the variable name without var(-- prefix since it's already typed
                completionItem.insertText = varName;
                // Set the range to replace only what's after var(--
                const wordStart = position.with(
                  undefined,
                  position.character - (varStartMatch[1]?.length || 0)
                );
                const wordEnd = position;
                completionItem.range = new vscode.Range(wordStart, wordEnd);
              } else {
                // Full insertion with var(-- prefix
                completionItem.insertText = `var(--${varName})`;
              }

              completionItem.sortText = `a${varName}`; // Sort design system vars first
              completionItems.push(completionItem);
            }
          }

          // Add local variables from workspace scan
          if (localVariables.length > 0) {
            // Use Trie for efficient prefix matching
            const matchingLocalVars = partialVarName
              ? localVariableTrie.find(partialVarName)
              : localVariableTrie.getAllWords();

            for (const localVarName of matchingLocalVars) {
              if (shouldExcludeVariable(localVarName)) {
                continue; // Skip excluded variables
              }

              // Find all definitions for this variable name
              const definitions = localVariables.filter(
                (def) => def.name === localVarName
              );

              if (definitions.length === 0) {
                continue;
              }

              const completionItem = new vscode.CompletionItem(
                `[Local] ${localVarName}`,
                vscode.CompletionItemKind.Variable
              );

              const firstDef = definitions[0];

              // Format location info for documentation
              const locationInfo =
                definitions.length === 1
                  ? `Defined in ${vscode.workspace.asRelativePath(
                      firstDef.fileUri
                    )}:${firstDef.line + 1}`
                  : `${definitions.length} definitions in workspace`;

              completionItem.detail = `Value: ${firstDef.value || "unknown"}`;

              // Create documentation with definition details
              const docText = new vscode.MarkdownString(
                `${firstDef.comment || "No description"}\n\n${locationInfo}`
              );

              // Add color preview if it's a color value
              if (firstDef.value && isColorValue(firstDef.value)) {
                const hexColors: { color: string }[] = [];
                const segments = firstDef.value.split(",").map((s) => s.trim());
                segments.forEach((segment) => {
                  const hexMatch = segment.match(/#[0-9a-fA-F]{3,8}\b/);
                  if (hexMatch) {
                    hexColors.push({ color: hexMatch[0] });
                  }
                });

                if (hexColors.length > 0) {
                  completionItem.kind = vscode.CompletionItemKind.Color;
                  // Show the first color in the label description to trigger the color preview in the dropdown
                  completionItem.label = `[Local] ${localVarName}`;
                  completionItem.detail = hexColors[0].color;
                  // Show all colors in the documentation
                  docText.appendMarkdown(`\n\n## Color Previews\n\n`);
                  hexColors.forEach(({ color }) => {
                    docText.appendMarkdown(
                      `<span style="display:inline-block;width:1em;height:1em;background-color:${color};border:1px solid #ccc;margin-right:4px;"></span> ${color}\n`
                    );
                  });
                  docText.appendMarkdown("\n");
                  docText.supportHtml = true;
                }
              }

              completionItem.documentation = docText;

              // Handle snippets and insertText
              if (varStartMatch) {
                // Only add the variable name without var(-- prefix
                completionItem.insertText = localVarName;
                // Set the range to replace only what's after var(--
                const wordStart = position.with(
                  undefined,
                  position.character - (varStartMatch[1]?.length || 0)
                );
                const wordEnd = position;
                completionItem.range = new vscode.Range(wordStart, wordEnd);
              } else {
                // Full insertion with var(-- prefix
                completionItem.insertText = `var(--${localVarName})`;
              }

              completionItem.sortText = `b${localVarName}`; // Sort after design system vars
              completionItems.push(completionItem);
            }
          }

          // Return completion list with items
          return completionItems;
        },
      },
      "-", // Triggered by hyphen (part of variable names)
      "(" // Triggered by opening parenthesis (for var())
    );

  // Create a composite disposable to clean up all resources when unregistered
  return vscode.Disposable.from(
    completionProviderDisposable,
    refreshSubscription
  );
}

/**
 * Checks if a value appears to be a color value.
 *
 * @param value - The value to check
 * @returns True if the value appears to be a color value
 */
function isColorValue(value: string): boolean {
  // Check for hex colors only (simplified to match requirements)
  return /#[0-9a-fA-F]{3,8}/.test(value);
}
