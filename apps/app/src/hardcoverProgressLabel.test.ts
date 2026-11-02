import { describe, expect, it } from "vitest";
import type { HardcoverProgress } from "@book-explorer/shared";
import { progressLabel, progressSpokenLabel } from "./hardcoverProgressLabel";

describe("progressLabel", () => {
  it.each<[HardcoverProgress, string | null]>([
    [{ status: "want", percent: null }, "On your Want to Read shelf"],
    [{ status: "reading", percent: 40 }, "Reading · 40%"],
    [{ status: "reading", percent: null }, "Currently reading"],
    [{ status: "read", percent: null }, "Read"],
    [{ status: "paused", percent: null }, "Paused"],
    [{ status: "dnf", percent: null }, "Did not finish"],
    [{ status: null, percent: null }, null],
  ])("%j -> %s", (progress, label) => {
    expect(progressLabel(progress)).toBe(label);
  });
});

describe("progressSpokenLabel", () => {
  it("names Hardcover for assistive tech", () => {
    expect(progressSpokenLabel("Reading · 40%")).toBe("Reading · 40% on Hardcover");
  });
});
