import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time comparison of the X-App-Key header against the server's
 * configured secret, so a timing side-channel can't be used to recover it a
 * byte at a time. `timingSafeEqual` itself throws on mismatched buffer
 * lengths rather than returning false, and comparing against a fixed-length
 * buffer would leak the expected length via a length-dependent timing
 * difference regardless — so the length check happens first, deliberately
 * outside the timing-safe comparison.
 */
export function isValidAppKey(provided: unknown, expected: string): boolean {
  if (typeof provided !== "string") return false;
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}
