import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { useTheme, useThemedStyles, type Theme } from "../theme";
import { nodeReveal } from "../threadReveal";

const NODES = [
  ["Book", "graphWork"],
  ["Author", "graphAuthor"],
  ["Subject", "graphSubject"],
  ["Genre", "graphGenre"],
] as const;

/** The graph's four node colors joined by the thread: Home's intro (labelled) and the empty states. Decorative.
 * `animated` draws the thread once on mount, each node appearing as the line reaches it; reduced motion skips to the end. */
export function ThreadMotif({ labelled, animated = false }: { labelled: boolean; animated?: boolean }) {
  const styles = useThemedStyles(createStyles);
  const reduceMotion = useReducedMotion();
  const play = animated && !reduceMotion;
  // One value drives the line and every node, so they can't drift apart.
  const progress = useSharedValue(play ? 0 : 1);
  useEffect(() => {
    if (play) progress.value = withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.cubic) });
  }, []);
  const lineStyle = useAnimatedStyle(() => ({ width: `${progress.value * 75}%` }));

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.thread}>
      <Animated.View style={[styles.line, lineStyle]} />
      {NODES.map(([label, color], i) => (
        <View key={label} style={styles.stop}>
          <Node progress={progress} index={i} color={color} />
          {labelled && <Text style={styles.label}>{label}</Text>}
        </View>
      ))}
    </View>
  );
}

function Node({ progress, index, color }: { progress: SharedValue<number>; index: number; color: (typeof NODES)[number][1] }) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const reveal = useAnimatedStyle(() => {
    const v = nodeReveal(progress.value, index, NODES.length);
    return { opacity: v, transform: [{ scale: 0.6 + 0.4 * v }] };
  });
  return <Animated.View style={[styles.node, { backgroundColor: theme.colors[color] }, reveal]} />;
}

function createStyles({ colors, fonts, typeScale, spacing }: Theme) {
  return StyleSheet.create({
    thread: { flexDirection: "row" },
    // Runs from the first node centre toward the last: four equal cells put those at 1/8 and 7/8, so full width is 75%, set by the animation.
    line: { position: "absolute", top: 6, left: "12.5%", height: 1, backgroundColor: colors.thread },
    stop: { flex: 1, alignItems: "center", gap: spacing.xs },
    node: { width: 12, height: 12, borderRadius: 6 },
    label: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint },
  });
}
