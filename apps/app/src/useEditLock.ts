import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { draftChanged, type Terms } from "./termsDraft";

export const SAVE_FIRST_NOTICE = "Save this book to a list before editing its genres, subjects and notes.";

/**
 * The one lock on a book or work page. Unlocking edits a local draft of genres and subjects that is
 * saved when locked again, or when the screen loses focus or unmounts, so leaving without relocking
 * doesn't lose edits. An unsaved record (`record` null) asks to be saved first and unlocks once it is.
 */
export function useEditLock({
  record,
  onUpdate,
  onRequestSave,
  startUnlocked,
}: {
  record: Terms | null;
  onUpdate: (c: Terms) => Promise<unknown>;
  onRequestSave: (notice: string) => void;
  startUnlocked?: boolean;
}) {
  const [unlocked, setUnlocked] = useState(false);
  // Waiting for a record to exist (after a save request, or `startUnlocked` before the record loads).
  const [pendingUnlock, setPendingUnlock] = useState(!!startUnlocked);
  const [draft, setDraft] = useState<Terms>({ subjects: [], genres: [] });
  const [error, setError] = useState<string | null>(null);

  // Latest values for the blur/unmount save below, which would otherwise see its first render's.
  const latest = useRef({ unlocked, draft, record, onUpdate });
  latest.current = { unlocked, draft, record, onUpdate };

  const unlock = (r: Terms) => {
    setDraft({ subjects: r.subjects, genres: r.genres });
    setError(null);
    setUnlocked(true);
  };

  useEffect(() => {
    if (pendingUnlock && record) {
      setPendingUnlock(false);
      unlock(record);
    }
  }, [pendingUnlock, record]);

  const saveDraft = async () => {
    const { draft, record, onUpdate } = latest.current;
    if (record && draftChanged(draft, record)) await onUpdate(draft);
  };

  // A focus cleanup runs on blur (a link pushed over this screen) and on unmount (Back).
  useFocusEffect(
    useCallback(
      () => () => {
        if (latest.current.unlocked) saveDraft().catch(() => setError("Couldn't save your changes"));
      },
      []
    )
  );

  const toggle = async () => {
    if (!unlocked) {
      if (record) unlock(record);
      else {
        setPendingUnlock(true);
        onRequestSave(SAVE_FIRST_NOTICE);
      }
      return;
    }
    try {
      await saveDraft();
      setUnlocked(false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your changes");
    }
  };

  const edit = (kind: keyof Terms, change: (list: string[]) => string[]) =>
    setDraft((d) => ({ ...d, [kind]: change(d[kind]) }));

  return { unlocked, draft, edit, toggle, error };
}
