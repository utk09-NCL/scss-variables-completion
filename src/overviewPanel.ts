// src/overviewPanel.ts
import * as vscode from "vscode";
import { ScssVariable } from "./jsonLoader";
import { LocalDefinition } from "./deepScanner";

/**
 * Manages the Overview Panel for displaying all SCSS variables.
 * Provides a visual interface for exploring design system and local variables.
 */
export class OverviewPanel {
  private static currentPanel: OverviewPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private variables: Map<string, ScssVariable>;
  private localVariables: LocalDefinition[];

  /**
   * Creates or reveals the Variables Overview panel.
   *
   * @param variables - Map of design system variables from JSON
   * @param localVariables - Array of locally defined variables
   * @param extensionUri - The extension's URI for loading resources
   */
  public static createOrShow(
    variables: Map<string, ScssVariable>,
    localVariables: LocalDefinition[],
    extensionUri: vscode.Uri
  ): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it
    if (OverviewPanel.currentPanel) {
      OverviewPanel.currentPanel.panel.reveal(column);
      OverviewPanel.currentPanel.updateVariables(variables, localVariables);
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      "scssVariablesOverview",
      "SCSS Variables Overview",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    OverviewPanel.currentPanel = new OverviewPanel(
      panel,
      variables,
      localVariables,
      extensionUri
    );
  }

  /**
   * Constructs a new Overview Panel instance.
   *
   * @param panel - The webview panel to manage
   * @param variables - Map of design system variables from JSON
   * @param localVariables - Array of locally defined variables
   * @param extensionUri - The extension's URI for loading resources
   */
  private constructor(
    panel: vscode.WebviewPanel,
    variables: Map<string, ScssVariable>,
    localVariables: LocalDefinition[],
    private readonly extensionUri: vscode.Uri
  ) {
    this.panel = panel;
    this.variables = variables;
    this.localVariables = localVariables;

    // Update the webview content initially
    this.update();

    // Listen for when the panel is disposed (user closes it)
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case "openFile":
            // Open the file at the specified location
            const uri = vscode.Uri.parse(message.uri);
            vscode.window.showTextDocument(uri).then((editor) => {
              const position = new vscode.Position(message.line, 0);
              editor.selection = new vscode.Selection(position, position);
              editor.revealRange(
                new vscode.Range(position, position),
                vscode.TextEditorRevealType.InCenter
              );
            });
            break;

          case "addToJson":
            // Show a dialog to add a local variable to the JSON file
            vscode.window
              .showInformationMessage(
                `Add "${message.name}" to scssVariables.json?`,
                "Yes",
                "No"
              )
              .then((answer) => {
                if (answer === "Yes") {
                  this.addLocalVariableToJson(message.name, message.value);
                }
              });
            break;
        }
      },
      null,
      this.disposables
    );
  }

  /**
   * Updates the variables displayed in the panel.
   *
   * @param variables - Updated map of design system variables
   * @param localVariables - Updated array of local variables
   */
  public updateVariables(
    variables: Map<string, ScssVariable>,
    localVariables: LocalDefinition[]
  ): void {
    this.variables = variables;
    this.localVariables = localVariables;
    this.update();
  }

  /**
   * Adds a local variable to the JSON file (stub - would need implementation).
   *
   * @param name - The name of the variable to add
   * @param value - The value of the variable
   */
  private addLocalVariableToJson(name: string, value: string): void {
    // This would need implementation to actually modify the JSON file
    vscode.window.showInformationMessage(
      `Adding "${name}" with value "${value}" would go here.`
    );
  }

  /**
   * Updates the HTML content of the webview.
   */
  private update(): void {
    this.panel.title = "SCSS Variables Overview";
    this.panel.webview.html = this.getHtmlForWebview();
  }

  /**
   * Generates the HTML content for the webview.
   *
   * @returns HTML string for the webview
   */
  private getHtmlForWebview(): string {
    // Organize variables for display
    const designSystemVars: Array<{
      name: string;
      description: string;
      value: string;
      colors: { theme: string; color: string }[];
      cssAttributes: string[];
    }> = [];

    this.variables.forEach((variable, name) => {
      // Format the value based on its type
      let valueText: string;
      const colorValues: { theme: string; color: string }[] = [];

      if (typeof variable.value === "string") {
        valueText = variable.value;
        // Extract color if present
        const colorRegex = /#[0-9a-fA-F]{3,8}\b/;
        const colorMatch = valueText.match(colorRegex);
        if (colorMatch) {
          colorValues.push({ theme: "default", color: colorMatch[0] });
        }
      } else if (typeof variable.value === "object") {
        const entries = Object.entries(variable.value);
        valueText = entries
          .map(([variant, val]) => `${variant}: ${val}`)
          .join("<br>");

        // Extract colors for each theme variant
        for (const [theme, val] of entries) {
          const colorRegex = /#[0-9a-fA-F]{3,8}\b/;
          const colorMatch = String(val).match(colorRegex);
          if (colorMatch) {
            colorValues.push({ theme, color: colorMatch[0] });
          }
        }
      } else {
        valueText = "Unknown value";
      }

      designSystemVars.push({
        name: name,
        description: variable.description || "",
        value: valueText,
        colors: colorValues,
        cssAttributes: variable.cssAttributesSupported || [],
      });
    });

    // Format local variables
    const localVars: Array<{
      name: string;
      value: string;
      kind: string;
      file: string;
      line: number;
      color?: string;
      comment?: string;
      fileUri: string;
      inDesignSystem: boolean;
    }> = [];

    // Create a map of local variable definitions by name
    const localVarMap = new Map<string, LocalDefinition[]>();
    for (const localVar of this.localVariables) {
      if (!localVarMap.has(localVar.name)) {
        localVarMap.set(localVar.name, []);
      }
      localVarMap.get(localVar.name)!.push(localVar);
    }

    // Process each unique local variable
    localVarMap.forEach((defs, name) => {
      const firstDef = defs[0];
      let valueText: string;
      let colorValue: string | undefined;

      if (firstDef.kind === "map" || firstDef.kind === "list") {
        // Format map/list entries
        valueText = firstDef.children
          ? firstDef.children
              .map((entry) => {
                if (entry.key) {
                  return `${entry.key}: ${entry.value}`;
                }
                return entry.value;
              })
              .join("<br>")
          : "Empty";
      } else {
        valueText = firstDef.value || "";
      }

      // Extract color if present
      const colorRegex = /#[0-9a-fA-F]{3,8}\b/;
      const colorMatch = valueText.match(colorRegex);
      if (colorMatch) {
        colorValue = colorMatch[0];
      }

      // Check if this variable is also in the design system
      const inDesignSystem = this.variables.has(name);

      localVars.push({
        name: name,
        value: valueText,
        kind: firstDef.kind,
        file: vscode.workspace.asRelativePath(firstDef.fileUri),
        line: firstDef.line,
        color: colorValue,
        comment: firstDef.comment,
        fileUri: firstDef.fileUri.toString(),
        inDesignSystem: inDesignSystem,
      });
    });

    // Sort variables by name for initial display
    designSystemVars.sort((a, b) => a.name.localeCompare(b.name));
    localVars.sort((a, b) => a.name.localeCompare(b.name));

    // Count unique CSS attribute types
    const cssAttributeTypes = new Set<string>();
    designSystemVars.forEach((variable) => {
      variable.cssAttributes.forEach((attr) => cssAttributeTypes.add(attr));
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SCSS Variables Overview</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
        }
        h1, h2 {
            color: var(--vscode-editor-foreground);
            margin-bottom: 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 8px;
        }
        .container {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }
        .controls {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-bottom: 16px;
            align-items: center;
        }
        .search-box {
            padding: 6px 12px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 2px;
            width: 250px;
        }
        .filter-select {
            padding: 6px 12px;
            border: 1px solid var(--vscode-dropdown-border);
            background-color: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border-radius: 2px;
        }
        .sort-select {
            padding: 6px 12px;
            border: 1px solid var(--vscode-dropdown-border);
            background-color: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border-radius: 2px;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin-bottom: 20px;
        }
        th {
            background-color: var(--vscode-editor-lineHighlightBackground);
            padding: 8px 12px;
            text-align: left;
            cursor: pointer;
            position: sticky;
            top: 0;
            z-index: 1;
        }
        th:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        td {
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            vertical-align: top;
            max-width: 400px;
        }
        tr:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .color-preview {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 1px solid var(--vscode-panel-border);
            vertical-align: middle;
            margin-right: 8px;
            border-radius: 2px;
        }
        .file-link {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
            cursor: pointer;
        }
        .file-link:hover {
            text-decoration: underline;
        }
        .tabs {
            display: flex;
            margin-bottom: 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .tab {
            padding: 8px 16px;
            cursor: pointer;
            background-color: var(--vscode-editor-background);
        }
        .tab.active {
            font-weight: bold;
            border-bottom: 2px solid var(--vscode-textLink-foreground);
        }
        .tab-content {
            display: none;
        }
        .tab-content.active {
            display: block;
        }
        .warning {
            color: var(--vscode-editorWarning-foreground);
            margin-right: 8px;
        }
        .chip {
            display: inline-block;
            padding: 2px 8px;
            margin-right: 4px;
            margin-bottom: 4px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 10px;
            font-size: 0.85em;
        }
        .add-button {
            color: var(--vscode-button-foreground);
            background-color: var(--vscode-button-background);
            border: none;
            padding: 4px 8px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 0.85em;
        }
        .add-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .stats {
            margin-bottom: 16px;
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
        }
        .empty-state {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <h1>SCSS Variables Overview</h1>

    <div class="tabs">
        <div class="tab active" data-tab="design-system">Design System Variables (${
          designSystemVars.length
        })</div>
        <div class="tab" data-tab="local">Local Variables (${
          localVars.length
        })</div>
    </div>

    <div class="container">
        <!-- Design System Variables Tab -->
        <div class="tab-content active" id="design-system-tab">
            <div class="controls">
                <input type="text" class="search-box" id="ds-search" placeholder="Search variables..." />

                <select class="filter-select" id="ds-type-filter">
                    <option value="all">All Types</option>
                    <option value="color">Colors</option>
                    <option value="spacing">Spacing</option>
                    <option value="typography">Typography</option>
                    <option value="other">Other</option>
                </select>

                <select class="filter-select" id="ds-attr-filter">
                    <option value="all">All CSS Properties</option>
                    ${Array.from(cssAttributeTypes)
                      .sort()
                      .map((attr) => `<option value="${attr}">${attr}</option>`)
                      .join("")}
                </select>

                <select class="sort-select" id="ds-sort">
                    <option value="name-asc">Name (A-Z)</option>
                    <option value="name-desc">Name (Z-A)</option>
                    <option value="type">By Type</option>
                </select>
            </div>

            <div class="stats" id="ds-stats">
                Showing ${designSystemVars.length} of ${
      designSystemVars.length
    } variables
            </div>

            ${
              designSystemVars.length === 0
                ? '<div class="empty-state">No design system variables found.</div>'
                : `<table id="ds-table">
                <thead>
                    <tr>
                        <th data-sort="name">Name</th>
                        <th data-sort="description">Description</th>
                        <th data-sort="value">Value</th>
                        <th data-sort="attributes">CSS Properties</th>
                    </tr>
                </thead>
                <tbody>
                    ${designSystemVars
                      .map(
                        (variable) => `
                        <tr data-name="${variable.name}" data-has-color="${
                          variable.colors.length > 0
                        }">
                            <td>
                                ${
                                  variable.colors.length > 0
                                    ? variable.colors
                                        .map(
                                          (color) =>
                                            `<span class="color-preview" style="background-color: ${color.color};"></span>`
                                        )
                                        .join("")
                                    : ""
                                }
                                --${variable.name}
                            </td>
                            <td>${variable.description}</td>
                            <td>${variable.value}</td>
                            <td>
                                ${variable.cssAttributes
                                  .map(
                                    (attr) =>
                                      `<span class="chip">${attr}</span>`
                                  )
                                  .join("")}
                            </td>
                        </tr>
                    `
                      )
                      .join("")}
                </tbody>
            </table>`
            }
        </div>

        <!-- Local Variables Tab -->
        <div class="tab-content" id="local-tab">
            <div class="controls">
                <input type="text" class="search-box" id="local-search" placeholder="Search variables..." />

                <select class="filter-select" id="local-type-filter">
                    <option value="all">All Types</option>
                    <option value="variable">Standard Variables</option>
                    <option value="map">Maps</option>
                    <option value="list">Lists</option>
                    <option value="color">Colors</option>
                    <option value="not-in-ds">Not in Design System</option>
                </select>

                <select class="sort-select" id="local-sort">
                    <option value="name-asc">Name (A-Z)</option>
                    <option value="name-desc">Name (Z-A)</option>
                    <option value="file">By File</option>
                    <option value="type">By Type</option>
                </select>
            </div>

            <div class="stats" id="local-stats">
                Showing ${localVars.length} of ${localVars.length} variables
            </div>

            ${
              localVars.length === 0
                ? '<div class="empty-state">No local variables found.</div>'
                : `<table id="local-table">
                <thead>
                    <tr>
                        <th data-sort="name">Name</th>
                        <th data-sort="value">Value</th>
                        <th data-sort="kind">Type</th>
                        <th data-sort="file">Location</th>
                        <th data-sort="comment">Comment</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${localVars
                      .map(
                        (variable) => `
                        <tr data-name="${
                          variable.name
                        }" data-has-color="${!!variable.color}" data-in-ds="${
                          variable.inDesignSystem
                        }" data-kind="${variable.kind}">
                            <td>
                                ${
                                  variable.color
                                    ? `<span class="color-preview" style="background-color: ${variable.color};"></span>`
                                    : ""
                                }
                                ${
                                  !variable.inDesignSystem
                                    ? '<span class="warning">⚠️</span>'
                                    : ""
                                }
                                --${variable.name}
                            </td>
                            <td>${variable.value}</td>
                            <td>${variable.kind}</td>
                            <td>
                                <a class="file-link" data-uri="${
                                  variable.fileUri
                                }" data-line="${variable.line}">
                                    ${variable.file}:${variable.line + 1}
                                </a>
                            </td>
                            <td>${variable.comment || ""}</td>
                            <td>
                                ${
                                  !variable.inDesignSystem
                                    ? `<button class="add-button" data-name="${variable.name}" data-value="${variable.value}">Add to JSON</button>`
                                    : ""
                                }
                            </td>
                        </tr>
                    `
                      )
                      .join("")}
                </tbody>
            </table>`
            }
        </div>
    </div>

    <script>
        (function() {
            // Tab switching
            const tabs = document.querySelectorAll('.tab');
            const tabContents = document.querySelectorAll('.tab-content');

            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    const tabId = tab.getAttribute('data-tab');

                    // Update active tab
                    tabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');

                    // Update active content
                    tabContents.forEach(content => {
                        content.classList.remove('active');
                        if (content.id === tabId + '-tab') {
                            content.classList.add('active');
                        }
                    });
                });
            });

            // Design System tab functionality
            const dsSearch = document.getElementById('ds-search');
            const dsTypeFilter = document.getElementById('ds-type-filter');
            const dsAttrFilter = document.getElementById('ds-attr-filter');
            const dsSort = document.getElementById('ds-sort');
            const dsTable = document.getElementById('ds-table');
            const dsStats = document.getElementById('ds-stats');

            if (dsTable) {
                const dsRows = Array.from(dsTable.querySelectorAll('tbody tr'));

                // Filter function for design system variables
                function filterDsRows() {
                    const searchTerm = dsSearch.value.toLowerCase();
                    const typeFilter = dsTypeFilter.value;
                    const attrFilter = dsAttrFilter.value;

                    let visibleCount = 0;
                    dsRows.forEach(row => {
                        const name = row.getAttribute('data-name').toLowerCase();
                        const hasColor = row.getAttribute('data-has-color') === 'true';
                        const attributes = Array.from(row.querySelectorAll('.chip')).map(chip => chip.textContent.toLowerCase());

                        // Apply search filter
                        const matchesSearch = name.includes(searchTerm) ||
                                             row.textContent.toLowerCase().includes(searchTerm);

                        // Apply type filter
                        let matchesType = true;
                        if (typeFilter === 'color') {
                            matchesType = hasColor;
                        } else if (typeFilter !== 'all') {
                            // Add more type filters as needed
                            matchesType = name.includes(typeFilter);
                        }

                        // Apply attribute filter
                        let matchesAttr = true;
                        if (attrFilter !== 'all') {
                            matchesAttr = attributes.includes(attrFilter.toLowerCase());
                        }

                        const isVisible = matchesSearch && matchesType && matchesAttr;
                        row.style.display = isVisible ? '' : 'none';

                        if (isVisible) visibleCount++;
                    });

                    // Update stats
                    dsStats.textContent = \`Showing \${visibleCount} of \${dsRows.length} variables\`;
                }

                // Sort function for design system variables
                function sortDsRows() {
                    const sortMethod = dsSort.value;
                    const tbody = dsTable.querySelector('tbody');

                    dsRows.sort((a, b) => {
                        if (sortMethod === 'name-asc') {
                            return a.getAttribute('data-name').localeCompare(b.getAttribute('data-name'));
                        } else if (sortMethod === 'name-desc') {
                            return b.getAttribute('data-name').localeCompare(a.getAttribute('data-name'));
                        } else if (sortMethod === 'type') {
                            const aColor = a.getAttribute('data-has-color') === 'true';
                            const bColor = b.getAttribute('data-has-color') === 'true';

                            if (aColor !== bColor) {
                                return aColor ? -1 : 1;
                            }
                            return a.getAttribute('data-name').localeCompare(b.getAttribute('data-name'));
                        }
                        return 0;
                    });

                    // Re-append rows in new order
                    dsRows.forEach(row => tbody.appendChild(row));
                }

                // Add event listeners
                dsSearch.addEventListener('input', filterDsRows);
                dsTypeFilter.addEventListener('change', filterDsRows);
                dsAttrFilter.addEventListener('change', filterDsRows);
                dsSort.addEventListener('change', sortDsRows);

                // Initial sort
                sortDsRows();
            }

            // Local variables tab functionality
            const localSearch = document.getElementById('local-search');
            const localTypeFilter = document.getElementById('local-type-filter');
            const localSort = document.getElementById('local-sort');
            const localTable = document.getElementById('local-table');
            const localStats = document.getElementById('local-stats');

            if (localTable) {
                const localRows = Array.from(localTable.querySelectorAll('tbody tr'));

                // Filter function for local variables
                function filterLocalRows() {
                    const searchTerm = localSearch.value.toLowerCase();
                    const typeFilter = localTypeFilter.value;

                    let visibleCount = 0;
                    localRows.forEach(row => {
                        const name = row.getAttribute('data-name').toLowerCase();
                        const hasColor = row.getAttribute('data-has-color') === 'true';
                        const inDesignSystem = row.getAttribute('data-in-ds') === 'true';
                        const kind = row.getAttribute('data-kind');

                        // Apply search filter
                        const matchesSearch = name.includes(searchTerm) ||
                                             row.textContent.toLowerCase().includes(searchTerm);

                        // Apply type filter
                        let matchesType = true;
                        if (typeFilter === 'color') {
                            matchesType = hasColor;
                        } else if (typeFilter === 'not-in-ds') {
                            matchesType = !inDesignSystem;
                        } else if (typeFilter !== 'all') {
                            matchesType = kind === typeFilter;
                        }

                        const isVisible = matchesSearch && matchesType;
                        row.style.display = isVisible ? '' : 'none';

                        if (isVisible) visibleCount++;
                    });

                    // Update stats
                    localStats.textContent = \`Showing \${visibleCount} of \${localRows.length} variables\`;
                }

                // Sort function for local variables
                function sortLocalRows() {
                    const sortMethod = localSort.value;
                    const tbody = localTable.querySelector('tbody');

                    localRows.sort((a, b) => {
                        if (sortMethod === 'name-asc') {
                            return a.getAttribute('data-name').localeCompare(b.getAttribute('data-name'));
                        } else if (sortMethod === 'name-desc') {
                            return b.getAttribute('data-name').localeCompare(a.getAttribute('data-name'));
                        } else if (sortMethod === 'file') {
                            const aFile = a.querySelector('.file-link').textContent;
                            const bFile = b.querySelector('.file-link').textContent;
                            return aFile.localeCompare(bFile);
                        } else if (sortMethod === 'type') {
                            const aKind = a.getAttribute('data-kind');
                            const bKind = b.getAttribute('data-kind');

                            if (aKind !== bKind) {
                                return aKind.localeCompare(bKind);
                            }
                            return a.getAttribute('data-name').localeCompare(b.getAttribute('data-name'));
                        }
                        return 0;
                    });

                    // Re-append rows in new order
                    localRows.forEach(row => tbody.appendChild(row));
                }

                // Add event listeners
                localSearch.addEventListener('input', filterLocalRows);
                localTypeFilter.addEventListener('change', filterLocalRows);
                localSort.addEventListener('change', sortLocalRows);

                // File link clicks
                document.querySelectorAll('.file-link').forEach(link => {
                    link.addEventListener('click', () => {
                        const uri = link.getAttribute('data-uri');
                        const line = parseInt(link.getAttribute('data-line'));

                        // Send message to extension
                        vscode.postMessage({
                            command: 'openFile',
                            uri: uri,
                            line: line
                        });
                    });
                });

                // Add to JSON buttons
                document.querySelectorAll('.add-button').forEach(button => {
                    button.addEventListener('click', () => {
                        const name = button.getAttribute('data-name');
                        const value = button.getAttribute('data-value');

                        // Send message to extension
                        vscode.postMessage({
                            command: 'addToJson',
                            name: name,
                            value: value
                        });
                    });
                });

                // Initial sort
                sortLocalRows();
            }

            // Table header sorting
            document.querySelectorAll('th[data-sort]').forEach(header => {
                header.addEventListener('click', () => {
                    const sortField = header.getAttribute('data-sort');
                    const table = header.closest('table');
                    const isDesignSystem = table.id === 'ds-table';

                    if (isDesignSystem) {
                        // Handle design system table sorting
                        if (sortField === 'name') {
                            dsSort.value = dsSort.value === 'name-asc' ? 'name-desc' : 'name-asc';
                            sortDsRows();
                        }
                        // Add other sort fields as needed
                    } else {
                        // Handle local variables table sorting
                        if (sortField === 'name') {
                            localSort.value = localSort.value === 'name-asc' ? 'name-desc' : 'name-asc';
                            sortLocalRows();
                        } else if (sortField === 'file') {
                            localSort.value = 'file';
                            sortLocalRows();
                        } else if (sortField === 'kind') {
                            localSort.value = 'type';
                            sortLocalRows();
                        }
                        // Add other sort fields as needed
                    }
                });
            });
        })();

        // Communicate with the extension
        const vscode = acquireVsCodeApi();
    </script>
</body>
</html>`;
  }

  /**
   * Cleans up resources when the panel is closed.
   */
  private dispose(): void {
    OverviewPanel.currentPanel = undefined;
    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
