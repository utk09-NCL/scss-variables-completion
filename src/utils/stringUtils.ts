// src/utils/stringUtils.ts
/**
 * Calculates the Levenshtein distance between two strings.
 * This measures how many single-character edits are needed to transform one string into another.
 *
 * @param a - First string
 * @param b - Second string
 * @returns The edit distance between the strings
 */
export function levenshteinDistance(a: string, b: string): number {
  // Create a matrix of size (a.length + 1) x (b.length + 1)
  const matrix: number[][] = Array(a.length + 1)
    .fill(null)
    .map(() => Array(b.length + 1).fill(null));

  // Initialize the first row and column
  for (let i = 0; i <= a.length; i++) {
    matrix[i][0] = i;
  }

  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Finds the closest variable names to the given variable name.
 *
 * @param variableName - The variable name to find similar names for
 * @param allVariableNames - All available variable names
 * @param maxResults - Maximum number of results to return
 * @returns Array of similar variable names, sorted by similarity
 */
export function findClosestVariableNames(
  variableName: string,
  allVariableNames: string[],
  maxResults: number = 3
): string[] {
  // Calculate distance for each variable and map to [variable, distance]
  const distances = allVariableNames.map((name) => ({
    name,
    distance: levenshteinDistance(
      variableName.toLowerCase(),
      name.toLowerCase()
    ),
  }));

  // Sort by distance (ascending)
  distances.sort((a, b) => a.distance - b.distance);

  // Return top N results, excluding exact matches
  return distances
    .filter((d) => d.distance > 0) // Exclude exact matches
    .slice(0, maxResults)
    .map((d) => d.name);
}
