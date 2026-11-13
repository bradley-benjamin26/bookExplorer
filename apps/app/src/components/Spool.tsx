import Svg, { Line, Rect } from "react-native-svg";
import { useTheme } from "../theme";

export const SPOOL_W = 24;
export const SPOOL_H = 36;
/** Where the thread leaves the spool, in the spool's own coordinates: the right edge of the wound thread. */
export const SPOOL_EXIT = { x: 20, y: 20 };

const WINDS = [11, 15, 19, 23, 27];

/** A side-on spool of thread: two flanges around wound thread. Decorative; draw the loose thread from `SPOOL_EXIT`.
 * `height` scales it (default the natural 36). */
export function Spool({ height = SPOOL_H }: { height?: number }) {
  const { colors } = useTheme();
  return (
    <Svg width={(SPOOL_W * height) / SPOOL_H} height={height} viewBox={`0 0 ${SPOOL_W} ${SPOOL_H}`}>
      <Rect x={6} y={7} width={14} height={22} fill={colors.thread} fillOpacity={0.18} />
      {WINDS.map((y) => (
        <Line key={y} x1={6} y1={y} x2={20} y2={y} stroke={colors.thread} strokeWidth={1.25} strokeLinecap="round" />
      ))}
      <Rect x={2} y={2} width={22} height={5} rx={2.5} fill={colors.paper} stroke={colors.thread} strokeWidth={1.5} />
      <Rect x={2} y={29} width={22} height={5} rx={2.5} fill={colors.paper} stroke={colors.thread} strokeWidth={1.5} />
    </Svg>
  );
}
