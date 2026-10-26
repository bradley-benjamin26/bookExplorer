import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";

type Entry<T> = { value: T; expiresAt: number };

export interface CacheEntryOptions {
  ttlMs: number;
}

// Bump when a cached value's shape changes so old persisted rows are ignored.
const CACHE_SCHEMA_VERSION = 1;
const PURGE_INTERVAL_MS = 1000 * 60 * 60;

// Optional second tier shared by every TtlCache that has a namespace. Off
// (undefined) unless initPersistentCache succeeds, so dev behaviour is unchanged.
let db: DatabaseSync | undefined;
let purgeTimer: NodeJS.Timeout | undefined;

function purgeExpired(): void {
  try {
    db?.prepare("DELETE FROM cache WHERE expires_at <= ?").run(Date.now());
  } catch {
    // Persistence is best-effort; the memory tier keeps working.
  }
}

export function initPersistentCache(path: string): void {
  closePersistentCache();
  try {
    // Loaded only here, so a server without CACHE_DB_PATH never loads node:sqlite.
    const sqlite = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
    db = new sqlite.DatabaseSync(path);
    db.exec("CREATE TABLE IF NOT EXISTS cache (k TEXT PRIMARY KEY, v TEXT NOT NULL, expires_at INTEGER NOT NULL)");
    purgeExpired();
    purgeTimer = setInterval(purgeExpired, PURGE_INTERVAL_MS);
    purgeTimer.unref();
  } catch (err) {
    console.error("Persistent cache unavailable, using memory only:", err);
    closePersistentCache();
  }
}

export function closePersistentCache(): void {
  clearInterval(purgeTimer);
  purgeTimer = undefined;
  try {
    db?.close();
  } catch {
    // already closed
  }
  db = undefined;
}

export class TtlCache<T> {
  private store = new Map<string, Entry<T>>();
  // Tracks fetches already in flight so concurrent requests for the same
  // uncached key (e.g. two near-simultaneous scans of the same barcode)
  // share one upstream call instead of each triggering their own —
  // otherwise two full Open Library + Wikidata round trips (one of them
  // rate-limited) would both fire for what is, from the caller's point of
  // view, the exact same request.
  private pending = new Map<string, Promise<T>>();

  // Expired entries are only dropped when their own key is read again, so
  // without a cap the store grows with every distinct key ever requested —
  // free-text search queries especially, but any id from a public caller.
  // Once full, the oldest-inserted entry is evicted (a Map iterates in
  // insertion order, so that's just its first key).
  constructor(
    private ttlMs: number,
    private maxEntries = 1000,
    // Enables the persistent tier for this cache (keys are prefixed with it).
    private namespace?: string
  ) {}

  private dbKey(key: string): string {
    return `${CACHE_SCHEMA_VERSION}:${this.namespace}:${key}`;
  }

  private readPersisted(key: string): { value: T; ttlMs: number } | undefined {
    if (!db || !this.namespace) return undefined;
    try {
      const row = db.prepare("SELECT v, expires_at FROM cache WHERE k = ?").get(this.dbKey(key)) as
        | { v: string; expires_at: number }
        | undefined;
      const ttlMs = row ? row.expires_at - Date.now() : 0;
      return row && ttlMs > 0 ? { value: JSON.parse(row.v) as T, ttlMs } : undefined;
    } catch {
      return undefined;
    }
  }

  private writePersisted(key: string, value: T, ttlMs: number): void {
    const json = JSON.stringify(value);
    if (!db || !this.namespace || json === undefined) return;
    try {
      db.prepare("INSERT OR REPLACE INTO cache (k, v, expires_at) VALUES (?, ?, ?)").run(
        this.dbKey(key),
        json,
        Date.now() + ttlMs
      );
    } catch {
      // Memory tier still holds the value.
    }
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs = this.ttlMs): void {
    // Re-inserting moves the key to the back of the eviction order.
    this.store.delete(key);
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /**
   * `fetcher` receives this entry's options and may lower `ttlMs` before
   * resolving — e.g. a result assembled while an optional source was down is
   * still worth returning, but shouldn't be remembered for the full TTL as
   * if that source genuinely had nothing.
   */
  async wrap(key: string, fetcher: (entry: CacheEntryOptions) => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight;

    const persisted = this.readPersisted(key);
    if (persisted) {
      this.set(key, persisted.value, persisted.ttlMs);
      return persisted.value;
    }

    const entry: CacheEntryOptions = { ttlMs: this.ttlMs };
    const promise = fetcher(entry)
      .then((value) => {
        this.set(key, value, entry.ttlMs);
        // entry.ttlMs already carries any DEGRADED_TTL_MS lowering.
        this.writePersisted(key, value, entry.ttlMs);
        return value;
      })
      .finally(() => {
        this.pending.delete(key);
      });

    this.pending.set(key, promise);
    return promise;
  }
}
