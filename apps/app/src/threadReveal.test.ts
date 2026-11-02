import { describe, expect, it } from "vitest";
import { nodeReveal } from "./threadReveal";

describe("nodeReveal", () => {
  it("shows the first node from the start", () => expect(nodeReveal(0, 0, 4)).toBe(1));
  it("hides a later node before the thread nears it", () => expect(nodeReveal(0, 1, 4)).toBe(0));
  it("shows a node fully once the thread reaches it", () => expect(nodeReveal(1 / 3, 1, 4)).toBe(1));
  it("is half shown midway through its fade", () => expect(nodeReveal(1 / 3 - 0.04, 1, 4)).toBeCloseTo(0.5));
  it("shows the last node at the end", () => expect(nodeReveal(1, 3, 4)).toBe(1));
  it("stays within 0 to 1", () => {
    for (const p of [-1, 0, 0.3, 0.5, 1, 2]) for (const i of [0, 1, 2, 3]) {
      const v = nodeReveal(p, i, 4);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
