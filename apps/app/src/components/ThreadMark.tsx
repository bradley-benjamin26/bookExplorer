import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { threadGeometry } from "../threadGeometry";
import { useTheme } from "../theme";

export const THREAD_MARK_HEIGHT = 20;
// Neat: one level line, three identical loops rising from it, a node between each.
const LOOPS = [1, 2, 3].map((gap) => ({ gap, scale: 0.8 }));
const STYLE = { wander: 0, baseline: THREAD_MARK_HEIGHT - 3 };

/** A short thread with loops and the graph's four node colours, as wide as the wordmark it sits under. Decorative. */
export function ThreadMark({ width }: { width: number }) {
  const { colors } = useTheme();
  if (width <= 0) return null;
  const dots = [colors.graphWork, colors.graphAuthor, colors.graphSubject, colors.graphGenre];
  const geo = threadGeometry(width, THREAD_MARK_HEIGHT, dots.length, 6, LOOPS, STYLE);
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={THREAD_MARK_HEIGHT}>
        <Path d={geo.d} fill="none" stroke={colors.thread} strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />
        {geo.points.map((p, i) => (
          // The paper-coloured ring lifts each node off the line.
          <Circle key={i} cx={p.x} cy={p.y} r={3} fill={dots[i]} stroke={colors.paper} strokeWidth={1.5} />
        ))}
      </Svg>
    </View>
  );
}
