// Bump when a stored record's shape changes, and add the upgrade to migrateStorage.
export const SCHEMA_VERSION = 1;

/** Fields every synced/exported record carries. `updatedAt` (ms) lets a future sync pick the newer copy. */
export interface Versioned {
  schemaVersion: number;
  updatedAt: number;
}

/** Fields the caller supplies; the storage layer stamps the rest on write. */
export type Unversioned<T extends Versioned> = Omit<T, keyof Versioned | "deletedAt">;

export function stamp<T extends object>(record: T): T & Versioned {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: Date.now(), ...record };
}
