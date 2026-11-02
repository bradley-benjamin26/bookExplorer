import { describe, expect, it } from "vitest";
import { editionToOpen } from "./workSaveFollow";

describe("editionToOpen", () => {
  it("opens the picked edition when it is on a list after Done", () => {
    expect(editionToOpen("9780141439518", true)).toBe("9780141439518");
  });

  it("stays when Done left the edition on no list", () => {
    expect(editionToOpen("9780141439518", false)).toBeNull();
  });

  it("stays when the work was saved instead", () => {
    expect(editionToOpen(null, true)).toBeNull();
  });
});
