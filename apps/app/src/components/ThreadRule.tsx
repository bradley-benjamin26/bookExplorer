import { useState } from "react";
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { threadGeometry } from "../threadGeometry";
import { useTheme } from "../theme";

const HEIGHT = 36; // tall enough for the loop to read as a loop

/** A thin, curved thread with one loop and the graph's four node colours, drawn under the header. Decorative. */
export function ThreadRule() {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const dots = [colors.graphWork, colors.graphAuthor, colors.graphSubject, colors.graphGenre];
  const geo = width > 0 ? threadGeometry(width, HEIGHT, dots.length) : null;
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // Paper behind it and a rule under it, so it reads as the header's lower edge.
      style={{ height: HEIGHT + 1, overflow: "hidden", backgroundColor: colors.paper, borderBottomWidth: 1, borderBottomColor: colors.border }}
    >
      {geo && (
        <Svg width={width} height={HEIGHT}>
          <Path d={geo.d} fill="none" stroke={colors.thread} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          {geo.points.map((p, i) => (
            // The paper-coloured ring lifts each node off the line, as on Home.
            <Circle key={i} cx={p.x} cy={p.y} r={5} fill={dots[i]} stroke={colors.paper} strokeWidth={2} />
          ))}
        </Svg>
      )}
    </View>
  );
}
