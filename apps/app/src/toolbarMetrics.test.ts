import { describe, expect, it } from "vitest";
import { TOOLBAR_CONTROL_HEIGHT } from "./toolbarMetrics";

describe("toolbarMetrics", () => {
  it("is the outer height of the Graph/List control", () => {
    expect(TOOLBAR_CONTROL_HEIGHT).toBe(46);
  });
  it("leaves the 38px option height once padding and border are removed", () => {
    expect(TOOLBAR_CONTROL_HEIGHT - 8).toBe(38);
  });
});
