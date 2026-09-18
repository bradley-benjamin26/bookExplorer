export interface GoogleBooksResult {
  description: string | null;
  coverUrl: string | null;
}

export async function lookupByIsbn(isbn: string): Promise<GoogleBooksResult | null> {
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Books request failed: ${res.status}`);

  const body = (await res.json()) as {
    items?: { volumeInfo?: { description?: string; imageLinks?: { thumbnail?: string; smallThumbnail?: string } } }[];
  };
  const info = body.items?.[0]?.volumeInfo;
  if (!info) return null;

  return {
    description: info.description ?? null,
    coverUrl: info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail ?? null,
  };
}
