/** How much of the thread's progress a node spends fading in, just before the line reaches it. */
const FADE = 0.08;

/** 0–1 visibility of a node whose position along the thread is `at` (0–1) as it draws (progress 0–1). Runs on the UI thread. */
export function revealAt(progress: number, at: number): number {
  "worklet";
  // 1 exactly when progress === at, without float drift.
  return Math.min(1, Math.max(0, (progress - at) / FADE + 1));
}

/** `revealAt` for node `index` of `count` evenly spaced along the thread. */
export function nodeReveal(progress: number, index: number, count: number): number {
  "worklet";
  return revealAt(progress, count > 1 ? index / (count - 1) : 0);
}
