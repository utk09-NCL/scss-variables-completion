# SCSS Variables Completion

![SCSS Variables Completion Logo](./images/icon.png)

---
A Visual Studio Code extension that enhances your SCSS and CSS workflow with intelligent autocompletion, diagnostics, and hover information for CSS custom properties and SCSS variables.

## Overview

SCSS Variables Completion helps you manage design tokens by providing intelligent suggestions based on your CSS properties and variable names. Define your variables in a JSON file, and the extension provides contextual suggestions, diagnostics, and detailed hover information across your workspace.

## Key Features

🔍 Smart Variable Completion

- Context-aware suggestions based on CSS properties (shows only color variables for color: properties)
- Fuzzy matching for variable names
- Live color previews in completion dropdown
- Labels variables as `[Design System]` (from JSON) or `[Local]` (from workspace)

🔎 Detailed Hover Information

- View descriptions, values, and source information when hovering over variables
- Direct links to jump to local variable definitions
- Theme and variant awareness for multi-valued variables

⚠️ Diagnostics

- Warnings for undefined variables
- Highlighting of variables used with unsupported CSS properties
- Detection of local variables not included in your design system JSON
- Identification of unused JSON variables with exact line numbers

🔍 Workspace Scanning

- Deep scanning of workspace for SCSS, module.scss, and CSS files
- Configurable excluded folders and maximum scan depth
- Automatic detection of local variables, mixins, and functions
- File change monitoring with debounced re-scanning

📊 Variables Overview

- Visual panel showing all available variables
- Filtering by variable type and source
- Highlighting of local variables not included in your design system JSON

🛠️ Performance

- Trie-based prefix matching for fast variable lookups
- Configurable workspace scanning settings
- Debounced file change handling to prevent excessive re-scanning

## Installation

1. Install from the VS Code Marketplace
2. Create or place a `scssVariables.json` file in your workspace root (or configure a custom path)
3. Start using variables in your SCSS/CSS files

## Configuration

Configure through VS Code settings (`settings.json`):

```json
{
  "scssVariables.path": "styles/scssVariables.json",
  "scssVariables.logLevel": "info",
  "scssVariables.excludedFolders": ["node_modules", "dist", "build"],
  "scssVariables.scanPaths": ["src/styles", "components/**/*.scss"],
  "scssVariables.maxScanDepth": 30,
  "scssVariables.enableDiagnostics": true,
  "scssVariables.showLocalVariableNotifications": false,
  "scssVariables.showScanProgress": true
}
```

### Settings Options

| Setting | Description | Default |
| --- | --- | --- |
| scssVariables.path | Path to your JSON variables file | "scssVariables.json" |
| scssVariables.logLevel | Logging detail level (error, warn, info, debug) | "info" |
| scssVariables.excludedFolders | Folders to skip during scanning | ["node_modules", "dist", "build"] |
| scssVariables.scanPaths | Specific paths/globs to scan (empty = scan all) | [] |
| scssVariables.maxScanDepth | Maximum folder depth for scanning | 30 |
| scssVariables.enableDiagnostics | Enable/disable diagnostic warnings | true |
| scssVariables.showLocalVariableNotifications | Show notifications for new local variables | false |
| scssVariables.showScanProgress | Show progress notifications when scanning | true |

## JSON Schema

Define your design tokens in a JSON file using this format:

```json
{
  "variable-1-bg-color": { // [USED]: actual variable that will be used
    "value": { // [NOT USED]: just for users to see the values
      "dark": " #292e3d",
      "light": " #ffffff"
    },
    "description": "Background/Surface color", // [NOT USED]: just for users to see the description
    "cssAttributesSupported": [ // [USED]: to show suggestions
      "background-color"
    ]
  },
  "variable-2-btn-padding-sm": {
    "value": {
      "small": "4px",
      "medium": "6px",
      "large": "8px"
    },
    "description": "Button padding (small)",
    "cssAttributesSupported": [
      "padding",
      "padding-top",
      "padding-right",
      "padding-bottom",
      "padding-left",
      "margin",
      "margin-top",
      "margin-right",
      "margin-bottom",
      "margin-left"
    ]
  }
}
```

### JSON Properties

- `value`: A string or an object with theme/variant options
- `description`: A description of the variable's purpose (shown in hover)
- `cssAttributesSupported`: Array of CSS properties where this variable is valid

## Commands

Access these commands from the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`):

- **SCSS Variables: Refresh Variables** - Reloads JSON and rescans workspace
- **SCSS Variables: Open Configuration File** - Opens your JSON variables file
- **SCSS Variables: Show Variables Overview** - Displays a table of all variables
- **SCSS Variables: Validate JSON Configuration** - Validates your JSON against the schema
- **SCSS Variables: Check Unused JSON Variables** - Reports unused variables defined in JSON

## Usage Tips

- Type `var(--` to trigger auto-completion, or use `Ctrl+Space` after `var(`
- Check the Problems panel for warnings about variable usage
- Use the Variables Overview panel to see all available variables at a glance
- Configure excluded folders to improve scanning performance in large projects
- Set specific scanPaths to focus on relevant directories

## Troubleshooting

If you encounter issues:

1. Verify your JSON file matches the expected schema
2. Check the SCSS Variables output channel for detailed logs
3. Adjust the logLevel setting to "debug" for more information
4. Use the "Refresh Variables" command to force a rescan
5. Ensure your workspace doesn't exceed the maxScanDepth setting

## License

[MIT](./LICENSE)
