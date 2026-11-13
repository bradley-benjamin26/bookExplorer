import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { threadGeometry } from "../threadGeometry";
import { useTheme } from "../theme";

export const THREAD_MARK_HEIGHT = 20;
// A small, loose thread: a little loop, a big one, then a middling one, like a line of thread dropped on a table.
const LOOPS = [{ gap: 1, scale: 0.55 }, { gap: 2 }, { gap: 3, scale: 0.7 }];

/** A short thread with loops and the graph's four node colours, as wide as the wordmark it sits under. Decorative. */
export function ThreadMark({ width }: { width: number }) {
  const { colors } = useTheme();
  if (width <= 0) return null;
  const dots = [colors.graphWork, colors.graphAuthor, colors.graphSubject, colors.graphGenre];
  const geo = threadGeometry(width, THREAD_MARK_HEIGHT, dots.length, 6, LOOPS);
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
