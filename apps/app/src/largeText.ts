import { useWindowDimensions } from "react-native";

// iOS's largest standard text size is ~1.35×; at or near it, and at every Accessibility size, cut-off titles lose most of their words.
const LARGE_TEXT_SCALE = 1.3;

export const isLargeText = (fontScale: number): boolean => fontScale >= LARGE_TEXT_SCALE;

/** True when the system text size is large: line caps lift so titles wrap instead of truncating. */
export const useLargeText = (): boolean => isLargeText(useWindowDimensions().fontScale);
