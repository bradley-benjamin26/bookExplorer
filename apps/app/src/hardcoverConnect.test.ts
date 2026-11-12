import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redeem: vi.fn(),
  save: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-linking", () => ({ createURL: (p: string) => `bookexplorer://${p}` }));
vi.mock("expo-web-browser", () => ({ openAuthSessionAsync: vi.fn() }));
vi.mock("./api/client", () => ({ API_BASE_URL: "https://api.test", redeemHardcoverHandoff: mocks.redeem }));
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
  it("redeems a code once; a second call during the first waits for the saved session", async () => {
    let finish!: (v: { token: string; username: string }) => void;
    mocks.redeem.mockReturnValue(new Promise((r) => (finish = r)));
    const first = redeemOnce("code1");
    let secondDone = false;
    const second = redeemOnce("code1").then(() => (secondDone = true));
    await Promise.resolve();
    expect(secondDone).toBe(false);
    finish({ token: "t", username: "u" });
    await Promise.all([first, second]);
    expect(mocks.save).toHaveBeenCalledWith("t");
    await redeemOnce("code1");
    expect(mocks.redeem).toHaveBeenCalledTimes(1);
  });
  it("shares a failure with the waiting caller and forgets it so a retry can run", async () => {
    mocks.redeem.mockRejectedValueOnce(new Error("expired"));
    const first = redeemOnce("code2");
    await expect(redeemOnce("code2")).rejects.toThrow("expired");
    await expect(first).rejects.toThrow("expired");
    mocks.redeem.mockResolvedValueOnce({ token: "t2", username: "u" });
    await redeemOnce("code2");
    expect(mocks.redeem).toHaveBeenCalledTimes(2);
  });
});
