import { describe, expect, it } from "vitest";
import { cameraBlockedHint } from "./cameraAccess";

describe("cameraBlockedHint", () => {
  it("on a plain-http web page, says the camera needs https", () => {
    expect(cameraBlockedHint("web", false)).toMatch(/secure \(https\)/);
  });

  it("on a secure web page, points to the browser's site settings", () => {
    expect(cameraBlockedHint("web", true)).toMatch(/Website Settings/);
  });

  it("on iOS or Android, points to the device Settings", () => {
    expect(cameraBlockedHint("ios", true)).toMatch(/Settings/);
    expect(cameraBlockedHint("ios", true)).not.toMatch(/https/);
  });
});
