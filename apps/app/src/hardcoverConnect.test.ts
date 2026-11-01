import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redeem: vi.fn(),
  save: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-linking", () => ({ createURL: (p: string) => `bookexplorer://${p}` }));
vi.mock("expo-web-browser", () => ({ openAuthSessionAsync: vi.fn() }));
vi.mock("./api/client", () => ({ startHardcoverConnect: vi.fn(), redeemHardcoverHandoff: mocks.redeem }));
vi.mock("./hardcoverSession", () => ({ saveSession: mocks.save }));

import { parseConnectReturn, redeemOnce } from "./hardcoverConnect";

describe("parseConnectReturn", () => {
  it("parses a handoff", () => expect(parseConnectReturn("bookexplorer://hardcover-connected?handoff=abc")).toEqual({ handoff: "abc" }));
  it("parses denial", () => expect(parseConnectReturn("exp://1.2.3.4:8081/--/hardcover-connected?error=denied")).toEqual({ error: "denied" }));
  it("unknown error values read as failed", () => expect(parseConnectReturn("bookexplorer://hardcover-connected?error=boom")).toEqual({ error: "failed" }));
  it("returns null for a URL with neither", () => expect(parseConnectReturn("bookexplorer://hardcover-connected")).toBeNull());
});

describe("redeemOnce", () => {
  beforeEach(() => vi.clearAllMocks());
  it("redeems a code once and skips it the second time", async () => {
    mocks.redeem.mockResolvedValue({ token: "t", username: "u" });
    expect(await redeemOnce("code1")).toBe(true);
    expect(await redeemOnce("code1")).toBe(false);
    expect(mocks.redeem).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledWith("t");
  });
});
