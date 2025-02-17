# SCSS Variables Completion

![SCSS Variables Completion Logo](./images/icon.png)

SCSS Variables Completion is a Visual Studio Code extension that provides intelligent autocompletion for CSS custom properties (CSS variables) in SCSS files. Simply define your design tokens in a JSON file, and this extension will offer contextual suggestions based on:

- The **CSS property** you’re typing (e.g., only show color variables when typing `color: var(--`).
- **Fuzzy matching** of partial variable names after `var(--`.
- **Multi-root workspace** capability.

It also supports **multi-root workspaces**—if you have more than one folder in your workspace, it will merge design tokens from each folder’s JSON file.

---

## Features

- **Autocompletion**
  When you type `var(--` in your `.scss` or `.module.scss` file, the extension suggests matching variables.
- **Property-Based Filtering**
  Suggests only variables that list the current CSS property in `cssAttributesSupported`.
- **Simple Fuzzy Matching**
  Type part of a variable name after `var(--` and see partial matches.
- **Multi-Root Support**
  Loads and merges tokens from each workspace folder.
- **Live Reload**
  Automatically updates completions when the JSON file changes.
- **Commands**
  - **Reload Variables** – Manually reload tokens.
  - **Open Variables File** – Quickly open the JSON file for editing.
  - **Preview All Variables** – View a table of loaded tokens in a WebView panel.
- **Debug Logging**
  An output channel named “SCSS Variables Completion” logs any errors or skipped folders.

---

## Requirements

- **Visual Studio Code** version 1.83.0 or higher.
- A **JSON file** containing your design tokens in each folder where you want completions.

---

## Installation

1. Install the extension from the VS Code Marketplace.
2. Make sure you have a file named `scssVariables.json` in your workspace (or configure a custom path in Settings).

---

## Configuration

This extension contributes these settings under `scssVariables`:

- **`scssVariables.path`**
  The path (relative to each workspace folder) to the JSON file containing SCSS variable definitions.
  Default: `"scssVariables.json"`

You can configure this in your **Settings** (File > Preferences > Settings), or by editing your `.vscode/settings.json` manually, for example:

```jsonc
{
  "scssVariables.path": "styles/designTokens.json"
}
```

If your workspace has **multiple folders**, each folder can have its own `scssVariables.json` (or custom path). The extension merges any variables it finds.

---

## JSON File Format

Create your design tokens in JSON. Each key is the variable name **without** the leading `--`. For example:

```json
{
  "color-primary": {
    "value": { "light": "#ff0000", "dark": "#00ff00" },
    "description": "Primary brand color",
    "cssAttributesSupported": ["color", "background-color"]
  },
  "border-radius-lg": {
    "value": "8px",
    "description": "Large border radius",
    "cssAttributesSupported": ["border-radius"]
  }
}
```

## Key Fields

- **`value`** - Can be a string or an object of variants (e.g., "light", "dark" or "small", "medium", "large").
- **`description`** - A short text describing the token.
- **`cssAttributesSupported`** - An array of CSS properties where this token should appear in suggestions (e.g., ["color", "border-color"]).

---

## Usage

1. Open a .scss file in VS Code.
2. Type a CSS property (e.g., `color:`) and then type `var(--`
3. The extension will scan all loaded variables:
    - Only those whose `cssAttributesSupported` includes `color` (case-insensitive) will appear.
    - If you type further after `var(--`, fuzzy matching narrows the list to tokens containing those letters in order.
4. Hover over a suggested token to see documentation (description, possible variant values, and supported CSS properties).
5. Confirm the token, and `var(--your-variable-name)` is inserted.

---

## Commands

Open the **Command Palette** (Ctrl+Shift+P on Windows/Linux, Cmd+Shift+P on macOS) and type "SCSS Variables" to see:

- SCSS Variables: Reload Variables -
Forces the extension to re-read your JSON files. Use this if you’ve made big changes.

- SCSS Variables: Open Variables File -
Opens the JSON file (from the first workspace folder if you have multiple).

- SCSS Variables: Preview All Variables -
Generates a WebView panel with a table of all loaded tokens, including their values, descriptions, and supported properties.

---

## Multi-Root Workspaces

If you have more than **one folder** in your workspace:

- The extension tries to load a `scssVariables.json` (or custom path) from each folder.
- If the file doesn’t exist, it asks whether to create it.
- Any variables found are merged into a single set, with later folders’ variables overriding earlier ones if the keys clash.
- When any file changes or is re-created, the extension reloads automatically.

---

## Debugging

1. Check the Output panel in VS Code (`View > Output`) and select `"SCSS Variables Completion"` to see logs.
2. You’ll see messages about skipped folders, JSON parse errors, or other issues.
3. Adjust your JSON files or run `SCSS Variables: Reload Variables` again.

---

## License

[MIT](./LICENSE)
