import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Platform, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import { useThemedStyles, type Theme } from "../theme";

/** A placeholder block that pulses (opacity 0.5↔1, 1.2s), or sits still under reduced motion. */
export function Skeleton({ width, height, style }: { width: DimensionValue; height: number; style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(createStyles);
  const opacity = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(true); // still until we know otherwise

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => !cancelled && setReduceMotion(on))
      .catch(() => !cancelled && setReduceMotion(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: 600, useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== "web" }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, opacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.block, { width, height, opacity }, style]}
    />
  );
}

/** The shape of a detail page while it loads: a cover, two title lines, three body lines. */
export function DetailSkeleton() {
  const styles = useThemedStyles(createStyles);
  return (
    <View accessibilityLabel="Loading" accessibilityLiveRegion="polite" style={styles.page}>
      <Skeleton width={180} height={260} />
      <Skeleton width="70%" height={24} />
      <Skeleton width="45%" height={24} />
      <View style={styles.body}>
        <Skeleton width="100%" height={14} />
        <Skeleton width="100%" height={14} />
        <Skeleton width="60%" height={14} />
      </View>
    </View>
  );
}

function createStyles({ colors, radii, spacing }: Theme) {
  return StyleSheet.create({
    block: { backgroundColor: colors.chipBackground, borderRadius: radii.sm },
    page: { flex: 1, backgroundColor: colors.paper, padding: spacing.lg, gap: spacing.md, alignItems: "flex-start" },
    body: { width: "100%", gap: spacing.sm, marginTop: spacing.md },
  });
}
