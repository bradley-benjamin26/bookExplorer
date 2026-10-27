import type { WorkRef } from "@book-explorer/shared";
import { describe, expect, it } from "vitest";
import { connectionStep } from "./connectionSteps";

const work = { openLibraryWorkId: "OL1W", title: "A" } as WorkRef;

describe("connectionStep", () => {
  it("from a work page, starts at the target then shows the result", () => {
    expect(connectionStep("work:OL9W", null, null)).toBe("pickTarget");
    expect(connectionStep("work:OL9W", null, work)).toBe("result");
  });
  it("from My Library, picks the start, then the target, then shows the result", () => {
    expect(connectionStep(undefined, null, null)).toBe("pickStart");
    expect(connectionStep(undefined, work, null)).toBe("pickTarget");
    expect(connectionStep(undefined, work, work)).toBe("result");
  });
});
