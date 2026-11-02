/** How much of the thread's progress a node spends fading in, just before the line reaches it. */
const FADE = 0.08;

/** 0–1 visibility of node `index` of `count` as the Home thread draws (progress 0–1). Runs on the UI thread. */
export function nodeReveal(progress: number, index: number, count: number): number {
  "worklet";
  const reached = count > 1 ? index / (count - 1) : 0;
  // 1 exactly when progress === reached, without float drift.
  return Math.min(1, Math.max(0, (progress - reached) / FADE + 1));
}
