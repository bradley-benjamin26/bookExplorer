import { describe, expect, it } from "vitest";
import { toAlternateIsbn } from "./isbn";

describe("toAlternateIsbn", () => {
  it("converts ISBN-10 to ISBN-13", () => {
    expect(toAlternateIsbn("0306406152")).toBe("9780306406157");
  });

  it("converts ISBN-13 to ISBN-10", () => {
    expect(toAlternateIsbn("9780306406157")).toBe("0306406152");
  });

  it("handles an X check digit in both directions", () => {
    expect(toAlternateIsbn("080442957X")).toBe("9780804429573");
    expect(toAlternateIsbn("9780804429573")).toBe("080442957X");
  });

  it("handles a different ISBN-10 check digit", () => {
    expect(toAlternateIsbn("0198526636")).toBe("9780198526636");
    expect(toAlternateIsbn("9780198526636")).toBe("0198526636");
  });

  it("ignores hyphens and spaces", () => {
    expect(toAlternateIsbn("978-0-306-40615-7")).toBe("0306406152");
  });

  it("has no ISBN-10 for 979 prefixes", () => {
    expect(toAlternateIsbn("9791034365463")).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(toAlternateIsbn("")).toBeNull();
    expect(toAlternateIsbn("12345")).toBeNull();
  });
});
