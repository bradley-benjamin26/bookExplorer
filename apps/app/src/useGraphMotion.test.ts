import { describe, expect, it, vi } from "vitest";

// The hook's module imports reanimated, which needs React Native; only the pure function is tested here.
vi.mock("react-native-reanimated", () => ({}));

import { shouldSuppressPress } from "./useGraphMotion";

describe("shouldSuppressPress", () => {
  it("suppresses a press right after a drag", () => expect(shouldSuppressPress(1000, 1100)).toBe(true));
  it("allows a press well after a drag", () => expect(shouldSuppressPress(1000, 1300)).toBe(false));
  it("allows a press when nothing was dragged", () => expect(shouldSuppressPress(0, Date.now())).toBe(false));
});
