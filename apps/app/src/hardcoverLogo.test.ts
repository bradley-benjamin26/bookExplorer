import { describe, expect, it } from "vitest";
import { hardcoverLogoSize } from "./hardcoverLogo";

describe("hardcoverLogoSize", () => {
  it("keeps the 512x85 aspect ratio", () => {
    expect(hardcoverLogoSize(85)).toEqual({ width: 512, height: 85 });
    expect(hardcoverLogoSize(14)).toEqual({ width: 84, height: 14 });
  });
});
