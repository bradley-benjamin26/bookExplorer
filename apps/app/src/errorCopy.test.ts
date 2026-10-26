import { describe, expect, it } from "vitest";
import { errorCopy } from "./errorCopy";

// Stands in for the real ApiError (its module pulls in react-native).
class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

describe("errorCopy", () => {
  it("keeps the server's minutes on a 503", () => {
    const msg = "Book data is temporarily unavailable, try again in 2 minutes.";
    expect(errorCopy(msg, new ApiError(msg, 503))).toBe(msg);
  });
  it("falls back to a generic 503 copy", () => {
    expect(errorCopy("Service Unavailable", new ApiError("Service Unavailable", 503))).toBe(
      "Book data is temporarily unavailable, try again in a few minutes."
    );
  });
  it("leaves other errors alone", () => {
    expect(errorCopy("nope", new ApiError("nope", 404))).toBe("nope");
    expect(errorCopy("nope", new Error("nope"))).toBe("nope");
  });
});
