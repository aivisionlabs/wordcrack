/** Join definitions for compact display (search snippets, list previews). */
export function formatDefinitions(definitions: string[]): string {
  return definitions.join(', ');
}

/** First sense — used for quizzes and one-line previews. */
export function primaryDefinition(definitions: string[]): string {
  return definitions[0] ?? '';
}

export function wordMatchesDefinition(word: { definitions: string[] }, query: string): boolean {
  const q = query.toLowerCase();
  return word.definitions.some((d) => d.toLowerCase().includes(q));
}
