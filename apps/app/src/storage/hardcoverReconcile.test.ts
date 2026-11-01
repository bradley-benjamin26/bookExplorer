import { describe, expect, it } from "vitest";
import { reconcile } from "./hardcoverReconcile";
import type { ListMember } from "./savedLists";

const m = (id: string, extra: Partial<ListMember> = {}): ListMember => ({ type: "book", id, title: id, addedAt: 1, ...extra });
const r = (hardcoverBookId: number, isbn: string | null = `isbn${hardcoverBookId}`) => ({ hardcoverBookId, title: `T${hardcoverBookId}`, isbn });

describe("reconcile", () => {
  it("keeps unpushed local members", () => {
    expect(reconcile([m("a")], [], 2)).toEqual([m("a")]);
  });
  it("keeps linked members still on Hardcover and drops removed ones", () => {
    const local = [m("a", { hardcoverBookId: 1 }), m("b", { hardcoverBookId: 2 })];
    expect(reconcile(local, [r(1)], 2)).toEqual([local[0]]);
  });
  it("adds Hardcover-only books as book members with their ISBN, in remote order", () => {
    expect(reconcile([m("a")], [r(5), r(4)], 9)).toEqual([
      m("a"),
      { type: "book", id: "isbn5", title: "T5", hardcoverBookId: 5, addedAt: 9 },
      { type: "book", id: "isbn4", title: "T4", hardcoverBookId: 4, addedAt: 9 },
    ]);
  });
  it("skips Hardcover books with no ISBN", () => {
    expect(reconcile([], [r(1, null)], 2)).toEqual([]);
  });
  it("never duplicates a work already linked to the same Hardcover book", () => {
    const local = [{ type: "work" as const, id: "OL1W", title: "Dune", addedAt: 1, hardcoverBookId: 9 }];
    expect(reconcile(local, [{ hardcoverBookId: 9, title: "Dune", isbn: "9780441013593" }], 2)).toEqual(local);
  });
  it("does not append a duplicate when an unlinked local book has the remote ISBN", () => {
    const local = [m("isbn7")];
    expect(reconcile(local, [r(7)], 2)).toEqual(local);
  });
  it("does not mutate its inputs", () => {
    const local = [m("a", { hardcoverBookId: 1 })];
    const snap = JSON.stringify(local);
    reconcile(local, [], 2);
    expect(JSON.stringify(local)).toBe(snap);
  });
});
