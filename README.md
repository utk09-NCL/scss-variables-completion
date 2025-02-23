# SCSS Variables Completion

![SCSS Variables Completion Logo](./images/icon.png)

SCSS Variables Completion is a Visual Studio Code extension that enhances your SCSS and CSS workflow with intelligent autocompletion, diagnostics, and hover information for CSS custom properties (variables). Define your design tokens in a JSON file, and the extension provides:

- **Contextual Suggestions**: Autocomplete based on CSS properties and fuzzy matching of variable names.
- **Color Previews**: See hex color swatches in the completion dropdown, like Tailwind CSS IntelliSense.
- **Hover Details**: View descriptions, values, and source info (JSON or local) with clickable links for local definitions.
- **Diagnostics**: Warnings for undefined variables, unsupported properties, and unused JSON variables.
- **Deep Scanning**: Finds local variables, mixins, and functions across your workspace.
- **Multi-Root Support**: Merges tokens from all workspace folders.

---

## Features

- **Autocompletion**:
  - Triggers on `var(--`, `var()`, `var( );`, etc., with fuzzy matching.
  - Force suggestions with `Ctrl+Space` after `var(`.
  - Filters by CSS property (e.g., only color variables for `color:`).
  - Labels variables as `[Design System]` (from JSON) or `[Local]` (from workspace).

- **Hover Information**:
  - Hover over `var(--variable)` to see its description, value, and source.
  - Clickable links jump to local definitions in SCSS files.

- **Diagnostics**:
  - Warns about undefined variables, unsupported properties, and local variables not in JSON.
  - Highlights unused JSON variables with exact line numbers in the Problems panel.

- **Deep Workspace Scanning**:
  - Scans up to a configurable depth (default 30) for `.scss`, `.module.scss`, and `.css` files.
  - Suggests local variables, mixins, and functions with file paths.

- **Commands**:
  - `SCSS Variables: Refresh Variables` – Reloads JSON and rescans the workspace.
  - `SCSS Variables: Open Configuration File` – Opens the JSON file.
  - `SCSS Variables: Show Variables Overview` – Displays a table of all variables, highlighting local ones not in JSON.
  - `SCSS Variables: Validate JSON Configuration` – Checks JSON against its schema.
  - `SCSS Variables: Check Unused JSON Variables` – Reports unused JSON variables.

- **Performance**:
  - Uses a Trie for fast prefix matching.
  - Configurable scan paths and depth limits.

- **Debugging**:
  - Logs to the "SCSS Variables" output channel, configurable via `logLevel`.

---

## Requirements

- **Visual Studio Code** version 1.83.0 or higher.
- A **JSON file** (e.g., `scssVariables.json`) with design tokens in your workspace.

---

## Installation

1. Install from the VS Code Marketplace.
2. Place a `scssVariables.json` file in your workspace root (or configure a custom path in settings).

---

## Configuration

Configure via `Settings` (File > Preferences > Settings) or `.vscode/settings.json`:

```jsonc
{
  "scssVariables.path": "styles/designTokens.json",
  "scssVariables.logLevel": "debug",
  "scssVariables.excludedFolders": ["node_modules", "dist"],
  "scssVariables.scanPaths": ["src/styles", "components/**/*.scss"],
  "scssVariables.maxScanDepth": 20,
  "scssVariables.enableDiagnostics": true
}
```

- `scssVariables.path`: Path to the JSON file (default: `"scssVariables.json"`).
- `scssVariables.logLevel`: Logging level (`error`, `warn`, `info`, `debug`; default: `"info"`).
- `scssVariables.excludedFolders`: Folders to skip during scanning (default: `["node_modules", "dist", "build"]`).
- `scssVariables.scanPaths`: Specific paths/globs to scan (default: `[]`, scans all).
- `scssVariables.maxScanDepth`: Max folder depth for scanning (default: `30`).
- `scssVariables.enableDiagnostics`: Enable/disable diagnostics (default: `true`).

---

## JSON File Format

Define tokens in a JSON file (e.g., `scssVariables.json`):

```jsonc
{
  "fxds-surface-primary-1": {
    "value": { "dark": "#292e3d", "light": "#ffffff" },
    "description": "Background/Surface color",
    "cssAttributesSupported": ["background-color"]
  },
  "fxds-text-ancillary": {
    "value": { "dark": "#525b7a", "light": "#525b7a" },
    "description": "Ancillary text color",
    "cssAttributesSupported": ["color", "fill", "background-color"]
  },
  "fxds-btn-padding-small": {
    "value": { "small": "0 4px", "medium": "0 8px", "large": "0 12px" },
    "description": "Button padding (small)",
    "cssAttributesSupported": [
      "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
      "margin", "margin-top", "margin-right", "margin-bottom", "margin-left"
    ]
  }
}
```

- `value`: String or object with variants (e.g., themes or sizes).
- `description`: Describes the token’s purpose.
- `cssAttributesSupported`: CSS properties where the token applies.

---

## Usage

1. Open a `.scss`, `.module.scss`, or `.css` file.
2. Type a CSS property (e.g., `color:`) followed by `var(--`.
3. Use `Ctrl+Space` to force suggestions.
4. Select a suggestion to insert `var(--variable-name)`.
5. Hover over a variable to see its details.
6. Check the Problems panel for diagnostics.
7. Use `SCSS Variables: Show Variables Overview` to view all tokens.

---

## Commands

From the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`):

- **Refresh Variables**: Reloads JSON and rescans the workspace.
- **Show Variables Overview**: Displays all variables in a table.
- **Open Configuration File**: Edits the JSON file.
- **Validate JSON Configuration**: Checks JSON validity.
- **Check Unused JSON Variables**: Finds unused JSON variables.

---

## License

[MIT](./LICENSE)
