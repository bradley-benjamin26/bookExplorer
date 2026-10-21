// Chains writes to the same key so a read-modify-write never reads a value
// another in-flight write is about to replace. Keyed per storage key so
// unrelated keys (e.g. saved items vs. history) don't serialize against
// each other.
const queues = new Map<string, Promise<unknown>>();

export function enqueueWrite<T>(key: string, write: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const result = previous.then(write, write);
  queues.set(
    key,
    result.catch(() => undefined)
  );
  return result;
}
