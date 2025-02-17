// File: src/types.ts

/**
 * This file defines the types (interfaces) used throughout the extension.
 * It helps ensure type safety and documents the structure of our design tokens.
 */

/**
 * Interface representing a design token for SCSS variables.
 * A design token represents a CSS custom property (variable) that may have
 * different variants (e.g., for light/dark themes or various sizes) and additional metadata.
 */
export interface IScssVariable {
  /**
   * The value of the design token.
   * - It can be a simple string if there is only one value.
   * - It can be an object mapping variant names (e.g., "light", "dark") to string values.
   */
  value: string | { [variant: string]: string };

  /**
   * A human-readable description of what this token represents.
   * For example, "Primary color" or "Font size for headings".
   */
  description?: string;

  /**
   * An array of CSS property names for which this token is intended.
   * For example: ["color", "background-color", "font-size"].
   * This helps filter which tokens should be suggested for a given CSS property.
   */
  cssAttributesSupported: string[];
}

/**
 * Interface for custom error objects.
 * This interface extends the built-in Error object to include an optional error code.
 */
export interface ICustomError extends Error {
  /**
   * An optional error code that can be used to identify the type of error.
   * For example, "ENOENT" if a file is not found.
   */
  code?: string;
}
