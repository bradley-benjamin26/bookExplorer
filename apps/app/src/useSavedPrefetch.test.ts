import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Work } from "@book-explorer/shared";
import AsyncStorage from "./test/asyncStorageMock";
import type { Snapshot } from "./storage/snapshot";

vi.mock("@react-native-async-storage/async-storage", () => import("./test/asyncStorageMock"));
// client.ts pulls in react-native; the prefetch only needs these two calls.
vi.mock("./api/client", () => ({ fetchWork: vi.fn() }));
vi.mock("./api/bookLookup", () => ({ fetchBookWithAlternate: vi.fn() }));

const apiWork = (id: string) =>
  ({ openLibraryWorkId: id, title: id, authors: [{ openLibraryId: "OLaA", name: "Austen" }], subjects: [{ label: "Courtship", sources: [] }], genres: [] }) as unknown as Work;

// Fresh module state (session failures, running pass) per test.
async function load(ids: string[]) {
  vi.resetModules();
  const { withWorkRecords } = await import("./storage/snapshot");
  const { replaceSavedWorks } = await import("./storage/savedWorks");
  const items = ids.map((id) => ({ schemaVersion: 1, updatedAt: 1, type: "work" as const, id, title: id }));
  await replaceSavedWorks(withWorkRecords({ schemaVersion: 1, items, books: [], works: [], libraries: [] } as Snapshot).works);
  const fetchWork = vi.mocked((await import("./api/client")).fetchWork);
  // After setup: the storage mock's I/O also runs on timers.
  vi.useFakeTimers();
  return { ...(await import("./useSavedPrefetch")), ...(await import("./storage/savedWorks")), fetchWork };
}

// Runs a pass to completion under fake timers (each request is followed by the prefetch delay).
async function settle(p: Promise<void>) {
  await vi.advanceTimersByTimeAsync(60_000);
  await p;
}

describe("prefetchMissingSaved", () => {
  beforeEach(() => AsyncStorage.clear());
  afterEach(() => vi.useRealTimers());

  it("seeds a migrated work's blank record from its fetched detail", async () => {
    const { prefetchMissingSaved, getSavedWork, fetchWork } = await load(["OL1W"]);
    fetchWork.mockImplementation(async (id) => apiWork(id));
    await settle(prefetchMissingSaved(new QueryClient()));
    vi.useRealTimers();
    expect(await getSavedWork("OL1W")).toMatchObject({ authorNames: ["Austen"], subjects: ["Courtship"] });
  });

  it("skips items that failed this session on the next pass, but retries ones a 503 never reached", async () => {
    const { prefetchMissingSaved, fetchWork } = await load(["OL1W", "OL2W", "OL3W"]);
    fetchWork.mockImplementation(async (id) => {
      if (id === "OL1W") throw Object.assign(new Error("gone"), { status: 404 });
      if (id === "OL2W") throw Object.assign(new Error("cooling down"), { status: 503 });
      return apiWork(id);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await settle(prefetchMissingSaved(client));
    expect(fetchWork.mock.calls.map(([id]) => id)).toEqual(["OL1W", "OL2W"]);

    fetchWork.mockClear();
    fetchWork.mockImplementation(async (id) => apiWork(id));
    await settle(prefetchMissingSaved(client));
    // OL1W's 404 sticks for the session; the 503 and the item it cut off are tried again.
    expect(fetchWork.mock.calls.map(([id]) => id).sort()).toEqual(["OL2W", "OL3W"]);
  });

  it("queues one more pass when called during a run, and shares the running promise", async () => {
    const { prefetchMissingSaved, fetchWork, saveWork } = await load(["OL1W"]);
    fetchWork.mockImplementation(async (id) => apiWork(id));
    const client = new QueryClient();
    const first = prefetchMissingSaved(client);
    await vi.advanceTimersByTimeAsync(100); // the pass has read the saved list and is pausing after OL1W
    const saving = saveWork(apiWork("OL9W")); // saved while the first pass runs, e.g. by an import
    await vi.advanceTimersByTimeAsync(10);
    await saving;
    expect(fetchWork.mock.calls.map(([id]) => id)).toEqual(["OL1W"]);
    const second = prefetchMissingSaved(client);
    const third = prefetchMissingSaved(client);
    expect(second).toBe(first);
    expect(third).toBe(first);
    await settle(first);
    expect(fetchWork.mock.calls.map(([id]) => id)).toEqual(["OL1W", "OL9W"]);
  });
});
