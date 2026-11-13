import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isValidIsbn, normalizeIsbn } from "@book-explorer/shared";
import type { Z3950Library } from "./registry.js";

export class Z3950UnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Z3950UnavailableError";
  }
}

const TIMEOUT_MS = 10_000;
const MAX_CONCURRENT = 4;

export function buildCommandFile(library: Z3950Library, isbn: string): string {
  return [
    `open ${library.host}:${library.port}/${library.database}`,
    `find @attr 1=7 ${isbn}`,
    "format usmarc",
    "elements F",
    "show 1",
    "quit",
  ].join("\n") + "\n";
}

/** Runs yaz-client with the given command-file text and returns its stdout. */
export type Z3950Runner = (commands: string, signal?: AbortSignal) => Promise<string>;

// shortcut: in-process semaphore, assumes one server process
let active = 0;
const waiting: Array<() => void> = [];
async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) { active++; return; }
  await new Promise<void>((resolve) => waiting.push(resolve)); // slot is handed over, active unchanged
}
function release(): void {
  const next = waiting.shift();
  if (next) next(); else active--;
}

export const runYazClient: Z3950Runner = async (commands, signal) => {
  const dir = await mkdtemp(join(tmpdir(), "yaz-"));
  try {
    const file = join(dir, "cmds.txt");
    await writeFile(file, commands);
    return await new Promise<string>((resolve, reject) => {
      execFile("yaz-client", ["-f", file], { timeout: TIMEOUT_MS, killSignal: "SIGKILL", signal, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
        if (err) reject(new Z3950UnavailableError(`yaz-client failed: ${err.message}`));
        else resolve(stdout);
      });
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

export async function searchByIsbn(
  library: Z3950Library,
  isbn: string,
  signal?: AbortSignal,
  run: Z3950Runner = runYazClient,
): Promise<string> {
  // normalizeIsbn silently drops junk, so reject anything but digits, X, hyphens and spaces up front.
  if (!/^[0-9Xx\- ]+$/.test(isbn) || !isValidIsbn(isbn)) throw new Error("Invalid ISBN");
  await acquire();
  try {
    if (signal?.aborted) throw new Z3950UnavailableError("Search aborted");
    const out = await run(buildCommandFile(library, normalizeIsbn(isbn)), signal);
    if (/Target closed connection|Connection rejected|Unable to connect/i.test(out) || !/Connection accepted/i.test(out)) {
      throw new Z3950UnavailableError(`${library.name} is unavailable`);
    }
    return out;
  } finally {
    release();
  }
}
