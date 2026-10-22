// Cheap shape checks on route params, so malformed input is rejected with a
// 400 up front instead of costing upstream requests (and a cache entry)
// just to learn it can't match anything. (ISBN checking lives in
// @book-explorer/shared, since the app's search bar needs it too.)

/** An Open Library author id, e.g. "OL21594A". */
export function isOpenLibraryAuthorId(id: string): boolean {
  return /^OL\d+A$/.test(id);
}

/** An Open Library work id, e.g. "OL66554W". */
export function isOpenLibraryWorkId(id: string): boolean {
  return /^OL\d+W$/.test(id);
}
