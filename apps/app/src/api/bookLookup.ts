import { toAlternateIsbn } from "../isbn";
import { ApiError, fetchBookByIsbn } from "./client";

// A source often has only the other form of an ISBN (10 vs 13), so a 404 gets
// one retry with it before the screen gives up.
export async function fetchBookWithAlternate(isbn: string) {
  try {
    return await fetchBookByIsbn(isbn);
  } catch (err) {
    const alternate = err instanceof ApiError && err.status === 404 ? toAlternateIsbn(isbn) : null;
    if (!alternate) throw err;
    try {
      return await fetchBookByIsbn(alternate);
    } catch {
      throw err; // report the ISBN the user actually asked for
    }
  }
}
