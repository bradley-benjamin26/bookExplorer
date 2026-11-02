export const hardcoverUrl = (slug: string | null | undefined, query: string): string =>
  slug ? `https://hardcover.app/books/${encodeURIComponent(slug)}` : `https://hardcover.app/search?q=${encodeURIComponent(query)}`;

export const openLibraryWorkUrl = (workId: string): string => `https://openlibrary.org/works/${workId}`;
