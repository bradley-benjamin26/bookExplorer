import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { threadGeometry } from "../threadGeometry";
import { useTheme } from "../theme";
import { Spool, SPOOL_EXIT, SPOOL_H, SPOOL_W } from "./Spool";

export const THREAD_MARK_HEIGHT = 26;
const SCALE = THREAD_MARK_HEIGHT / SPOOL_H;
const EXIT = { x: SPOOL_EXIT.x * SCALE, y: SPOOL_EXIT.y * SCALE };

/** A spool with a short thread coming off it and the graph's four node colours, as wide as the wordmark it sits under. Decorative. */
export function ThreadMark({ width }: { width: number }) {
  const { colors } = useTheme();
  if (width <= 0) return null;
  const dots = [colors.graphWork, colors.graphAuthor, colors.graphSubject, colors.graphGenre];
  // Nodes start past the spool's flange so the first one doesn't sit on it.
  const inset = SPOOL_W * SCALE + 6;
  const geo = threadGeometry(width, THREAD_MARK_HEIGHT, dots.length, inset, undefined, { wander: 0, baseline: EXIT.y, start: EXIT.x });
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={THREAD_MARK_HEIGHT}>
        <Path d={geo.d} fill="none" stroke={colors.thread} strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />
        {geo.points.map((p, i) => (
          // The paper-coloured ring lifts each node off the line.
          <Circle key={i} cx={p.x} cy={p.y} r={3} fill={dots[i]} stroke={colors.paper} strokeWidth={1.5} />
        ))}
      </Svg>
      <View style={{ position: "absolute", left: 0, top: 0 }}>
        <Spool height={THREAD_MARK_HEIGHT} />
      </View>
    </View>
  );
}
