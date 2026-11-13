import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { useThemedStyles, type Theme } from "../theme";
import { threadGeometry } from "../threadGeometry";
import { Spool, SPOOL_EXIT, SPOOL_H } from "./Spool";

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** A spool with a looped thread coming off it: the empty states. Decorative.
 * `animated` draws the thread once on mount; reduced motion skips to the end. */
export function ThreadMotif({ animated = false }: { animated?: boolean }) {
  const styles = useThemedStyles(createStyles);
  const reduceMotion = useReducedMotion();
  const play = animated && !reduceMotion;
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(play ? 0 : 1);
  useEffect(() => {
    if (play) progress.value = withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.cubic) });
  }, []);
  const geo = width > 0 ? threadGeometry(width, SPOOL_H, 0, 0, undefined, { baseline: SPOOL_EXIT.y, wander: 0, start: SPOOL_EXIT.x }) : null;
  const length = geo?.length ?? 1;
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - progress.value) }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.thread}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <Spool />
      {geo && (
        <Svg width={width} height={SPOOL_H} style={StyleSheet.absoluteFill}>
          <AnimatedPath
            d={geo.d}
            fill="none"
            stroke={styles.line.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={[length, length]}
            animatedProps={lineProps}
          />
        </Svg>
      )}
    </View>
  );
}

function createStyles({ colors }: Theme) {
  return StyleSheet.create({
    thread: { height: SPOOL_H },
    line: { color: colors.thread },
  });
}
