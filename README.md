# SCSS Variables Completion

![SCSS Variables Completion Logo](./images/icon.png)

SCSS Variables Completion is a Visual Studio Code extension that provides intelligent autocompletion for CSS custom properties (CSS variables) in SCSS and CSS files. Define your design tokens in a JSON file and let the extension offer contextual suggestions based on:

- The CSS property you’re typing (e.g., only show color variables when typing color: var(--).
- Fuzzy matching of partial variable names after var(-- (even within empty parentheses).
- Native colour preview: When a token includes a hex color, a color swatch is shown to the left of the variable name (just like Tailwind CSS IntelliSense).
- Detailed documentation in the suggestions panel, displaying both the token’s value and description.
- Multi-root workspace capability.

---

## Features

- **Autocompletion on Demand**:
When you type `var(--` (or even `var()`, or `var(--)`) in your `.scss`, `.module.scss`, or `.css` file, the extension shows matching design tokens—even if the parentheses are empty. You can also **force suggestions** using `CTRL+SPACE`.

- **Property-Based Filtering**:
Only variables that list the current CSS property in `cssAttributesSupported` are suggested. For example, when typing color: var(--, only tokens supporting the color property appear.

- **Detailed Documentation**:
Hovering over a suggestion shows a documentation popup that includes the token’s description and its value (pretty-printed JSON), so you know exactly what the token represents.

- **Multi-Root Support**:
The extension loads and merges tokens from each workspace folder. If a folder does not have the designated JSON file, the extension will skip it (and log a warning).

- **Commands**:
  - SCSS Variables: Reload Variables – Forces the extension to re-read your JSON files and update the suggestions.
  - SCSS Variables: Open Variables File – Opens the JSON file from the first workspace folder for quick editing.
- **Debugging**:
An output channel named "SCSS Variables Completion" logs any errors, JSON parsing issues, or skipped folders.

---

## Requirements

- **Visual Studio Code** version 1.83.0 or higher.
- A **JSON file** containing your design tokens in each folder where you want completions.

---

## Installation

1. Install the extension from the VS Code Marketplace.
2. Ensure you have a file named `scssVariables.json` in your workspace (or configure a custom path in Settings).

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
  },
  "border-radius-sm": {
    "value": {
      "small": "4px",
      "medium": "6px",
      "large": "8px"
    },
    "description": "Small border radius",
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

1. Open a `.scss`, `.module.scss`, or `.css` file in VS Code.
2. Type a CSS property (e.g., color:) and then type `var(--`.
    - Pressing CTRL+SPACE forces suggestions to appear.
3. Suggestions are filtered to show only those tokens supporting the CSS property, with fuzzy matching on the token name.
4. Hover over a suggestion to view detailed documentation (description and token value).
5. Confirm the suggestion to insert `var(--your-variable-name)` with the correct formatting.

---

## Commands

Open the **Command Palette** (Ctrl+Shift+P on Windows/Linux, Cmd+Shift+P on macOS) and type "SCSS Variables" to see:

- Open the Command Palette (Ctrl+Shift+P on Windows/Linux, Cmd+Shift+P on macOS) and type "SCSS Variables" to access:

- **SCSS Variables: Reload Variables** – Reloads the design tokens from the JSON file.
- **SCSS Variables: Open Variables File** – Opens the JSON file for editing

---

## License

[MIT](./LICENSE)
