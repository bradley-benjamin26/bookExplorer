import { describe, expect, it } from "vitest";
import { listServiceLabels } from "./listServiceLabels";

describe("listServiceLabels", () => {
  it.each(["Hardcover", "Open Library"] as const)("names %s in every button", (s) => {
    expect(listServiceLabels(s)).toEqual({ sync: `Sync with ${s}`, unlink: `Unlink ${s}`, copy: `Copy to ${s}` });
  });
});
