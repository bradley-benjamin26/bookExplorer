import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "./test/asyncStorageMock";

const rn = vi.hoisted(() => ({ Platform: { OS: "ios" } }));
const secure = vi.hoisted(() => {
  const m = new Map<string, string>();
  return {
    m,
    getItemAsync: async (k: string) => m.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => void m.set(k, v),
    deleteItemAsync: async (k: string) => void m.delete(k),
  };
});
vi.mock("react-native", () => rn);
vi.mock("expo-secure-store", () => secure);
vi.mock("@react-native-async-storage/async-storage", () => import("./test/asyncStorageMock"));

async function fresh() {
  vi.resetModules();
  return import("./hardcoverSession");
}

describe("hardcoverSession", () => {
  beforeEach(async () => {
    secure.m.clear();
    await AsyncStorage.clear();
    rn.Platform.OS = "ios";
  });

  it("save → get → clear round-trips in memory and native storage", async () => {
    const s = await fresh();
    expect(s.getSessionToken()).toBeNull();
    await s.saveSession("tok");
    expect(s.getSessionToken()).toBe("tok");
    expect(secure.m.get("hardcover-session")).toBe("tok");
    await s.clearSession();
    expect(s.getSessionToken()).toBeNull();
    expect(secure.m.size).toBe(0);
  });

  it("clearSession tells the registered listener, which can unregister", async () => {
    const s = await fresh();
    const cleared = vi.fn();
    const off = s.onSessionCleared(cleared);
    await s.clearSession();
    expect(cleared).toHaveBeenCalledTimes(1);
    off();
    await s.clearSession();
    expect(cleared).toHaveBeenCalledTimes(1);
  });

  it("loadSession restores the stored token", async () => {
    secure.m.set("hardcover-session", "stored");
    const s = await fresh();
    await s.loadSession();
    expect(s.getSessionToken()).toBe("stored");
  });

  it("web uses AsyncStorage", async () => {
    rn.Platform.OS = "web";
    const s = await fresh();
    const storage = (await import("@react-native-async-storage/async-storage")).default; // same instance the module got after resetModules
    await s.saveSession("w");
    expect(await storage.getItem("hardcover-session")).toBe("w");
    expect(secure.m.size).toBe(0);
    await s.clearSession();
    expect(await storage.getItem("hardcover-session")).toBeNull();
  });
});
