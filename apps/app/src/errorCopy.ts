const UNAVAILABLE = "Book data is temporarily unavailable";

/** The text for an error screen: a 503 (an upstream in a cooldown) keeps the server's "try again in N minutes" copy, else says to try again in a few minutes. */
export function errorCopy(message: string, error?: unknown): string {
  // Duck-typed on ApiError's status so this stays free of the react-native imports in the API client.
  if ((error as { status?: number } | null)?.status !== 503) return message;
  return message.startsWith(UNAVAILABLE) ? message : `${UNAVAILABLE}, try again in a few minutes.`;
}
