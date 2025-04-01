// src/trie.ts
/**
 * A Trie (prefix tree) node for efficient prefix-based searching of variable names.
 * Optimized for fast autocompletion lookup with fuzzy matching capabilities.
 */
class TrieNode {
  children: Map<string, TrieNode>;
  isEndOfWord: boolean;

  constructor() {
    this.children = new Map<string, TrieNode>();
    this.isEndOfWord = false;
  }
}

/**
 * Trie data structure for fast prefix-based searching of variable names.
 * Supports exact prefix matching and fuzzy searching for autocompletion.
 */
export class Trie {
  private root: TrieNode;

  constructor() {
    this.root = new TrieNode();
  }

  /**
   * Inserts a word into the trie.
   *
   * @param word - The word to insert
   */
  public insert(word: string): void {
    let current = this.root;

    // Process each character in the word
    for (const char of word) {
      if (!current.children.has(char)) {
        current.children.set(char, new TrieNode());
      }
      current = current.children.get(char)!;
    }

    // Mark the end of the word
    current.isEndOfWord = true;
  }

  /**
   * Checks if a word exists in the trie.
   *
   * @param word - The word to check
   * @returns True if the word exists, false otherwise
   */
  public search(word: string): boolean {
    const node = this.findNode(word);
    return node !== null && node.isEndOfWord;
  }

  /**
   * Checks if there is any word in the trie that starts with the given prefix.
   *
   * @param prefix - The prefix to check
   * @returns True if a word with the prefix exists, false otherwise
   */
  public startsWith(prefix: string): boolean {
    return this.findNode(prefix) !== null;
  }

  /**
   * Finds all words in the trie that start with the given prefix.
   *
   * @param prefix - The prefix to search for
   * @returns Array of words that start with the prefix
   */
  public find(prefix: string): string[] {
    const result: string[] = [];
    const node = this.findNode(prefix);

    if (node) {
      this.collectWords(node, prefix, result);
    }

    // If fuzzy matching is needed, also try with similar prefixes
    if (prefix.length > 2) {
      // Try skipping one character for fuzzy matching
      for (let i = 0; i < prefix.length - 1; i++) {
        const fuzzyPrefix = prefix.substring(0, i) + prefix.substring(i + 1);
        const fuzzyNode = this.findNode(fuzzyPrefix);

        if (fuzzyNode) {
          this.collectWords(fuzzyNode, fuzzyPrefix, result, prefix);
        }
      }
    }

    return result;
  }

  /**
   * Finds a node that corresponds to the given word.
   *
   * @param word - The word to find the node for
   * @returns The node if found, null otherwise
   */
  private findNode(word: string): TrieNode | null {
    let current = this.root;

    for (const char of word) {
      if (!current.children.has(char)) {
        return null;
      }
      current = current.children.get(char)!;
    }

    return current;
  }

  /**
   * Recursively collects all words starting from a node.
   *
   * @param node - The starting node
   * @param prefix - The prefix accumulated so far
   * @param result - Array to collect the words
   * @param filterPrefix - Optional prefix for filtering results
   */
  private collectWords(
    node: TrieNode,
    prefix: string,
    result: string[],
    filterPrefix?: string
  ): void {
    if (node.isEndOfWord) {
      // If a filter prefix is provided, check if the word is relevantly similar
      if (!filterPrefix || this.isSimilar(prefix, filterPrefix)) {
        // Add the word only if not already in the results
        if (!result.includes(prefix)) {
          result.push(prefix);
        }
      }
    }

    for (const [char, childNode] of node.children.entries()) {
      this.collectWords(childNode, prefix + char, result, filterPrefix);
    }
  }

  /**
   * Calculates if two strings are similar enough for fuzzy matching.
   * Uses a simple method based on character overlap.
   *
   * @param word - The word to check
   * @param filter - The filter to compare against
   * @returns True if the strings are similar enough
   */
  private isSimilar(word: string, filter: string): boolean {
    // For short strings, require higher similarity
    if (filter.length <= 3) {
      return word.includes(filter);
    }

    // Count common characters
    const chars = new Set<string>(filter.split(""));
    let commonCount = 0;

    for (const char of word) {
      if (chars.has(char)) {
        commonCount++;
      }
    }

    // Require at least 70% character overlap for similarity
    return commonCount / filter.length >= 0.7;
  }

  /**
   * Removes a word from the trie.
   *
   * @param word - The word to remove
   * @returns True if the word was removed, false if it wasn't in the trie
   */
  public remove(word: string): boolean {
    return this.removeHelper(this.root, word, 0);
  }

  /**
   * Helper method for word removal.
   *
   * @param current - The current node
   * @param word - The word to remove
   * @param index - The current character index
   * @returns True if the word was removed
   */
  private removeHelper(
    current: TrieNode,
    word: string,
    index: number
  ): boolean {
    // Base case: we've processed all characters
    if (index === word.length) {
      // Word not found
      if (!current.isEndOfWord) {
        return false;
      }

      // Mark as not end of word
      current.isEndOfWord = false;

      // Return whether this node can be deleted
      return current.children.size === 0;
    }

    const char = word[index];

    if (!current.children.has(char)) {
      return false; // Character not found, word doesn't exist
    }

    const childNode = current.children.get(char)!;
    const shouldDeleteChild = this.removeHelper(childNode, word, index + 1);

    // If the child should be deleted, remove it
    if (shouldDeleteChild) {
      current.children.delete(char);
      // Return whether current node can be deleted
      return current.children.size === 0 && !current.isEndOfWord;
    }

    return false;
  }

  /**
   * Clears all words from the trie.
   */
  public clear(): void {
    this.root = new TrieNode();
  }

  /**
   * Gets all words in the trie.
   *
   * @returns Array of all words
   */
  public getAllWords(): string[] {
    const result: string[] = [];
    this.collectWords(this.root, "", result);
    return result;
  }
}
