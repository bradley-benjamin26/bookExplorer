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

async function fresh(key = "hardcover-session") {
  vi.resetModules();
  return (await import("./sessionStore")).createSessionStore(key);
}

describe("sessionStore", () => {
  beforeEach(async () => {
    secure.m.clear();
    await AsyncStorage.clear();
    rn.Platform.OS = "ios";
  });

  it("save → get → clear round-trips in memory and native storage", async () => {
    const s = await fresh();
    expect(s.get()).toBeNull();
    await s.save("tok");
    expect(s.get()).toBe("tok");
    expect(secure.m.get("hardcover-session")).toBe("tok");
    await s.clear();
    expect(s.get()).toBeNull();
    expect(secure.m.size).toBe(0);
  });

  it("clear tells the registered listener, which can unregister", async () => {
    const s = await fresh();
    const cleared = vi.fn();
    const off = s.onCleared(cleared);
    await s.clear();
    expect(cleared).toHaveBeenCalledTimes(1);
    off();
    await s.clear();
    expect(cleared).toHaveBeenCalledTimes(1);
  });

  it("load restores the stored token", async () => {
    secure.m.set("hardcover-session", "stored");
    const s = await fresh();
    await s.load();
    expect(s.get()).toBe("stored");
  });

  it("two stores with different keys don't share a token", async () => {
    const { createSessionStore } = await import("./sessionStore");
    const a = createSessionStore("a");
    const b = createSessionStore("b");
    await a.save("t1");
    expect(b.get()).toBeNull();
    await b.load();
    expect(b.get()).toBeNull();
    expect(secure.m.get("a")).toBe("t1");
  });

  it("web uses AsyncStorage", async () => {
    rn.Platform.OS = "web";
    const s = await fresh();
    const storage = (await import("@react-native-async-storage/async-storage")).default; // same instance the module got after resetModules
    await s.save("w");
    expect(await storage.getItem("hardcover-session")).toBe("w");
    expect(secure.m.size).toBe(0);
    await s.clear();
    expect(await storage.getItem("hardcover-session")).toBeNull();
  });
});
