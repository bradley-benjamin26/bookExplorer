import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";
import { open, seal, sha256 } from "./secretBox.js";

export interface HardcoverTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}
export interface StoredSession extends HardcoverTokens {
  hardcoverUserId: number;
  username: string;
}

const PENDING_TTL_MS = 10 * 60_000;
const HANDOFF_TTL_MS = 2 * 60_000;

let db: DatabaseSync | undefined;

function conn(): DatabaseSync {
  if (!db) throw new Error("Account store is not open");
  return db;
}

export function openAccountStore(path: string): void {
  closeAccountStore();
  // Loaded only here, so a server without ACCOUNT_DB_PATH never loads node:sqlite.
  const sqlite = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
  db = new sqlite.DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_pending (state TEXT PRIMARY KEY, verifier TEXT NOT NULL, return_to TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS handoffs (code_hash TEXT PRIMARY KEY, session_token TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, hardcover_user_id INTEGER NOT NULL, username TEXT NOT NULL, access_token TEXT NOT NULL, refresh_token TEXT NOT NULL, access_expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
  `);
}

export function closeAccountStore(): void {
  try {
    db?.close();
  } catch {
    // already closed
  }
  db = undefined;
}

export const accountStoreOpen = (): boolean => db !== undefined;

export function savePending(state: string, value: { verifier: string; returnTo: string }): void {
  // Abandoned connects never reach takePending, so expired rows are cleared here.
  conn().prepare("DELETE FROM oauth_pending WHERE created_at < ?").run(Date.now() - PENDING_TTL_MS);
  conn().prepare("INSERT OR REPLACE INTO oauth_pending VALUES (?, ?, ?, ?)").run(state, value.verifier, value.returnTo, Date.now());
}

export function takePending(state: string): { verifier: string; returnTo: string } | null {
  const row = conn().prepare("SELECT verifier, return_to, created_at FROM oauth_pending WHERE state = ?").get(state) as
    | { verifier: string; return_to: string; created_at: number }
    | undefined;
  conn().prepare("DELETE FROM oauth_pending WHERE state = ?").run(state);
  if (!row || Date.now() - row.created_at > PENDING_TTL_MS) return null;
  return { verifier: row.verifier, returnTo: row.return_to };
}

export function saveHandoff(code: string, sessionToken: string): void {
  conn().prepare("DELETE FROM handoffs WHERE expires_at < ?").run(Date.now());
  conn().prepare("INSERT OR REPLACE INTO handoffs VALUES (?, ?, ?)").run(sha256(code), seal(sessionToken), Date.now() + HANDOFF_TTL_MS);
}

export function takeHandoff(code: string): string | null {
  const hash = sha256(code);
  const row = conn().prepare("SELECT session_token, expires_at FROM handoffs WHERE code_hash = ?").get(hash) as
    | { session_token: string; expires_at: number }
    | undefined;
  conn().prepare("DELETE FROM handoffs WHERE code_hash = ?").run(hash);
  if (!row || Date.now() > row.expires_at) return null;
  return open(row.session_token);
}

export function createSession(sessionToken: string, s: StoredSession): void {
  conn()
    .prepare("INSERT OR REPLACE INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(sha256(sessionToken), s.hardcoverUserId, s.username, seal(s.accessToken), seal(s.refreshToken), s.expiresAt, Date.now());
}

export function getSession(sessionToken: string): StoredSession | null {
  const r = conn()
    .prepare("SELECT hardcover_user_id, username, access_token, refresh_token, access_expires_at FROM sessions WHERE token_hash = ?")
    .get(sha256(sessionToken)) as
    | { hardcover_user_id: number; username: string; access_token: string; refresh_token: string; access_expires_at: number }
    | undefined;
  if (!r) return null;
  return {
    hardcoverUserId: r.hardcover_user_id,
    username: r.username,
    accessToken: open(r.access_token),
    refreshToken: open(r.refresh_token),
    expiresAt: r.access_expires_at,
  };
}

export function updateTokens(sessionToken: string, t: HardcoverTokens): void {
  conn()
    .prepare("UPDATE sessions SET access_token = ?, refresh_token = ?, access_expires_at = ? WHERE token_hash = ?")
    .run(seal(t.accessToken), seal(t.refreshToken), t.expiresAt, sha256(sessionToken));
}

export function deleteSession(sessionToken: string): void {
  conn().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(sessionToken));
}
