const STOPWORDS = new Set(
  "the and of to a in is his her he she with for that until was it as on by an at from but not are be this they their which who has had have were been its or when into after one".split(" "),
);

/**
 * True unless the text is clearly not English.
 * shortcut: a stopword heuristic; switch to a language-ID library if it misjudges real descriptions.
 */
export function looksEnglish(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  const nonLatin = letters.filter((c) => !/\p{Script=Latin}/u.test(c)).length;
  if (nonLatin > letters.length * 0.2) return false;
  const words = text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  if (words.length < 9) return true;
  return words.filter((w) => STOPWORDS.has(w)).length >= words.length * 0.08;
}

export function englishOrNull(text: string | null): string | null {
  return text && looksEnglish(text) ? text : null;
}
