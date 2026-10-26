import { describe, expect, it } from "vitest";
import { acceptScan, DEBOUNCE_MS, isIsbnBarcode, parseTypedIsbn, saveAll } from "./batchScan";

describe("isIsbnBarcode", () => {
  it("accepts valid 978 and 979 EANs", () => {
    expect(isIsbnBarcode("9780306406157")).toBe(true);
    expect(isIsbnBarcode("9791032305690")).toBe(true);
  });
  it("rejects bad checksum, wrong prefix and wrong length", () => {
    expect(isIsbnBarcode("9780306406158")).toBe(false);
    expect(isIsbnBarcode("5901234123457")).toBe(false);
    expect(isIsbnBarcode("0306406152")).toBe(false);
    expect(isIsbnBarcode("978030640615")).toBe(false);
  });
});

describe("acceptScan", () => {
  it("ignores non-ISBN barcodes", () => {
    expect(acceptScan(new Map(), "5901234123457", 0)).toBeNull();
  });
  it("debounces repeats inside the window and re-accepts after it", () => {
    const seen = new Map<string, number>();
    expect(acceptScan(seen, "9780306406157", 0)).toBe("9780306406157");
    expect(acceptScan(seen, "9780306406157", 1000)).toBeNull();
    // a held barcode keeps refreshing the window
    expect(acceptScan(seen, "9780306406157", 2500)).toBeNull();
    expect(acceptScan(seen, "9780306406157", 2500 + DEBOUNCE_MS)).toBe("9780306406157");
  });
  it("tracks different codes independently", () => {
    const seen = new Map<string, number>();
    acceptScan(seen, "9780306406157", 0);
    expect(acceptScan(seen, "9791032305690", 100)).toBe("9791032305690");
  });
});

describe("parseTypedIsbn", () => {
  it("normalizes hyphenated input and rejects invalid", () => {
    expect(parseTypedIsbn("978-0-306-40615-7")).toBe("9780306406157");
    expect(parseTypedIsbn("123")).toBeNull();
  });
  it("converts a valid ISBN-10 to its ISBN-13 and rejects a bad check digit", () => {
    expect(parseTypedIsbn("0-306-40615-2")).toBe("9780306406157");
    expect(parseTypedIsbn("080442957X")).toBe("9780804429573");
    expect(parseTypedIsbn("0306406153")).toBeNull();
  });
});

describe("saveAll", () => {
  it("reports partial failure and keeps saving the rest", async () => {
    const items = [{ isbn: "a" }, { isbn: "b" }, { isbn: "c" }];
    const saved: string[] = [];
    const result = await saveAll(items, async (i) => {
      if (i.isbn === "b") throw new Error("boom");
      saved.push(i.isbn);
    });
    expect(result).toEqual({ a: "saved", b: "failed", c: "saved" });
    expect(saved).toEqual(["a", "c"]);
  });
});
