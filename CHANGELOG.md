# Change Log

## [0.1.90] - 2025-02-23

### Added

- **Hover Provider**: Displays description, value, and source (JSON or local) when hovering over `var(--variable)`, with clickable links to local definitions.
- **Bidirectional Diagnostics**: Warns about local variables not in JSON and unused JSON variables, with precise line numbers in the Problems panel.
- **Trie Optimization**: Uses a Trie for faster prefix matching in autocompletion.
- **Configurable Scanning**: Added `scssVariables.scanPaths` and `scssVariables.maxScanDepth` settings to control workspace scanning.
- **Enhanced Overview Panel**: Highlights local variables not in JSON and adds a "Jump to Definition" button for JSON variables.
- **User Feedback**: Shows progress notifications during JSON reloads and workspace scans.
- **Schema Flexibility**: Relaxed JSON schema to support any string values (e.g., "0 4px").
- **Error Handling**: Improved error messages for JSON parsing and file access issues.

### Changed

- Renamed `scssVariables.configPath` to `scssVariables.path` for consistency.
- Updated completion labels to `[Design System]` and `[Local]` from `[JSON]` and `[LOCAL]`.
- Enhanced diagnostics granularity to pinpoint unused JSON variables in the file.

### Fixed

- Ensured Ctrl+Space triggers suggestions by adding space as a trigger character.

## [0.1.82] - 2024

### Added - [0.1.82] - 2024

- Initial release of SCSS Variables Completion extension
- Auto-completion support for CSS custom properties in SCSS files
- JSON configuration file support for variable definitions
- Live reload of variables when JSON file changes
- Commands to manually reload and open variables JSON file
- Support for `.scss`, `.module.scss`, `.css` files
