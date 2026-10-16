type Entry<T> = { value: T; expiresAt: number };

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
    private maxEntries = 1000
  ) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    // Re-inserting moves the key to the back of the eviction order.
    this.store.delete(key);
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  async wrap(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight;

    const promise = fetcher()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => {
        this.pending.delete(key);
      });

    this.pending.set(key, promise);
    return promise;
  }
}
