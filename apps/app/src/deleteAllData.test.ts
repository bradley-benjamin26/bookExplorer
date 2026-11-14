import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "./test/asyncStorageMock";

const api = vi.hoisted(() => ({ disconnectHardcover: vi.fn(), disconnectOpenLibrary: vi.fn() }));
const hc = vi.hoisted(() => ({ token: null as string | null, clearSession: vi.fn() }));
const ol = vi.hoisted(() => ({ token: null as string | null, clearOpenLibrarySession: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => import("./test/asyncStorageMock"));
vi.mock("./api/client", () => api);
vi.mock("./hardcoverSession", () => ({ getSessionToken: () => hc.token, clearSession: hc.clearSession }));
vi.mock("./openLibrarySession", () => ({ getOpenLibrarySessionToken: () => ol.token, clearOpenLibrarySession: ol.clearOpenLibrarySession }));

const { deleteAllData } = await import("./deleteAllData");

describe("deleteAllData", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    hc.token = ol.token = null;
    await AsyncStorage.clear();
  });

  it("disconnects connected accounts on the server and wipes local storage and cache", async () => {
    hc.token = "h";
    ol.token = "o";
    api.disconnectHardcover.mockRejectedValue(new Error("offline")); // a failed server call must not stop the local wipe
    api.disconnectOpenLibrary.mockResolvedValue(undefined);
    await AsyncStorage.setItem("book-explorer:saved", "[1]");
    const qc = new QueryClient();
    qc.setQueryData(["work", "OL1W"], { title: "x" });

    await deleteAllData(qc);

    expect(api.disconnectHardcover).toHaveBeenCalled();
    expect(api.disconnectOpenLibrary).toHaveBeenCalled();
    expect(hc.clearSession).toHaveBeenCalled();
    expect(ol.clearOpenLibrarySession).toHaveBeenCalled();
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
    expect(qc.getQueryData(["work", "OL1W"])).toBeUndefined();
  });

  it("skips server calls for accounts that were never connected", async () => {
    await deleteAllData(new QueryClient());
    expect(api.disconnectHardcover).not.toHaveBeenCalled();
    expect(api.disconnectOpenLibrary).not.toHaveBeenCalled();
  });
});
