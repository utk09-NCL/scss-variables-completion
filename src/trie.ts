// src/trie.ts
/**
 * A Trie (prefix tree) data structure for fast prefix matching of SCSS variable names.
 * Helps the extension quickly find variables that match what the user is typing.
 */
export class Trie {
  // The root node of the Trie, starting empty.
  private root: TrieNode = {};

  /**
   * Adds a variable name to the Trie for later searching.
   * @param word - The variable name to add (e.g., "fxds-surface-primary-1").
   */
  insert(word: string): void {
    let node = this.root; // Start at the root.
    // Loop through each character in the lowercase word.
    for (const char of word.toLowerCase()) {
      // If the character isn’t in the current node, create a new empty node.
      if (!node[char]) {
        node[char] = {};
      }
      // Move to the next node (the one for this character).
      node = node[char] as TrieNode;
    }
    // Mark the end of the word with a flag.
    node.isEnd = true;
  }

  /**
   * Finds all variable names in the Trie that start with a given prefix.
   * @param prefix - What the user has typed so far (e.g., "fxds").
   * @returns An array of full variable names that match the prefix.
   */
  find(prefix: string): string[] {
    let node = this.root; // Start at the root.
    // Follow the path for each character in the prefix.
    for (const char of prefix.toLowerCase()) {
      if (!node[char]) {
        return [];
      } // If the path stops, no matches exist.
      node = node[char] as TrieNode;
    }
    // Collect all complete words from this point in the Trie.
    return this.collectWords(node, prefix.toLowerCase());
  }

  /**
   * Helper function to gather all words from a Trie node onward.
   * @param node - The current node in the Trie.
   * @param prefix - The prefix built so far.
   * @returns An array of complete variable names.
   */
  private collectWords(node: TrieNode, prefix: string): string[] {
    const results: string[] = []; // Store matching words here.
    // If this node marks the end of a word, add it to results.
    if (node.isEnd) {
      results.push(prefix);
    }

    // Look at all child nodes (next characters).
    for (const char in node) {
      if (char !== "isEnd") {
        // Skip the end flag itself.
        // Recursively collect words from this child node.
        results.push(
          ...this.collectWords(node[char] as TrieNode, prefix + char)
        );
      }
    }
    return results; // Return all found words.
  }
}

/**
 * Interface for a Trie node, which can have child nodes or an end flag.
 */
interface TrieNode {
  [key: string]: TrieNode | boolean | undefined; // Keys are characters, values are nodes or the isEnd flag.
  isEnd?: boolean; // Marks the end of a variable name.
}
