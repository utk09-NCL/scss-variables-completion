// File: src/types.ts
export interface IScssVariable {
  /**
   * The value can be either a string (for single values)
   * or an object (for variants like `light/dark` or `small/medium/large`).
   */
  value: string | { [variant: string]: string };
  /**
   * Description of this design token.
   */
  description?: string;
  /**
   * A list of CSS properties that this token is intended to be used with.
   * e.g., ["color", "background-color", "font-size"].
   */
  cssAttributesSupported: string[];
}


export interface ICustomError extends Error {
  /**
   * The error code, e.g., "FileNotFound" or "ENOENT".
   */
  code?: string;
}