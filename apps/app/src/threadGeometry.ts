export interface ThreadPoint {
  x: number;
  y: number;
  /** Fraction (0-1) of the path's length at which the line reaches this stop. */
  at: number;
}

export interface ThreadGeometry {
  /** SVG path: one M, then cubic C segments. */
  d: string;
  /** Sampled length in px, for a stroke-dash draw-in. */
  length: number;
  points: ThreadPoint[];
}

type Pt = [number, number];
type Cubic = [Pt, Pt, Pt, Pt];

const SAMPLES = 24;
const r = (n: number) => Math.round(n * 100) / 100;

function cubicAt([p0, p1, p2, p3]: Cubic, t: number): Pt {
  const u = 1 - t;
  const f = (i: 0 | 1) => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i];
  return [f(0), f(1)];
}

function cubicLength(c: Cubic): number {
  let len = 0;
  let prev = c[0];
  for (let i = 1; i <= SAMPLES; i++) {
    const p = cubicAt(c, i / SAMPLES);
    len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  return len;
}

export interface ThreadLoop {
  /** Which gap between waypoints (0 = before the first stop) holds the loop. */
  gap: number;
  /** Loop size relative to the largest that fits (default 1). */
  scale?: number;
  /** Hang the loop below the line instead of rising above it. */
  down?: boolean;
}

/** A thread running left to right through `stops` evenly spaced stops (first at `inset`, last at `width - inset`),
 * wandering up and down, with round loops where the line crosses itself: by default one, in the middle gap.
 * Every part of the curve stays inside the `width` x `height` box. */
export function threadGeometry(
  width: number,
  height: number,
  stops: number,
  inset = 8,
  loops?: ThreadLoop[],
  /** `wander`: how far stops drift above/below the baseline, as a fraction of height (default 0.15; 0 keeps them level).
   * `baseline`: the line's y (default the middle). Loops always rise from the line toward the top. */
  style: { wander?: number; baseline?: number } = {}
): ThreadGeometry {
  const mid = style.baseline ?? height / 2;
  const wander = height * (style.wander ?? 0.15);
  const span = width - 2 * inset;
  const waypoints: Pt[] = [
    [0, mid],
    ...Array.from({ length: stops }, (_, i): Pt => [stops > 1 ? inset + (span * i) / (stops - 1) : width / 2, mid + (i % 2 ? wander : -wander)]),
    [width, mid],
  ];
  const gaps = waypoints.length - 1;
  const loopList = loops ?? [{ gap: Math.floor(gaps / 2) }];

  const curves: Cubic[] = [];
  // Index in `curves` of the cubic that ends at each waypoint after the first.
  const endsAt: number[] = [];
  for (let i = 0; i < gaps; i++) {
    const [p, q] = [waypoints[i], waypoints[i + 1]];
    const dx = q[0] - p[0];
    const loop = loopList.find((l) => l.gap === i);
    if (loop) {
      // A cursive loop on the gap's midline: rise to the circle's right side, over the top and down its left side,
      // then cross the rising stroke and carry on to q. Sized to stay inside the box.
      // Loops sit on a given baseline, otherwise just above the bottom edge.
      const base = style.baseline ?? height - 2;
      const dir = loop.down ? -1 : 1; // 1 rises toward the top, -1 hangs toward the bottom
      const room = loop.down ? height - base - 1 : base - 1;
      const rho = Math.min(((height - 4) / 2.2) * (loop.scale ?? 1), dx * 0.22, room / 2);
      const k = rho * 0.5523;
      const mx = (p[0] + q[0]) / 2;
      const right: Pt = [mx + rho, base - dir * rho];
      const top: Pt = [mx, base - dir * 2 * rho];
      const left: Pt = [mx - rho, base - dir * rho];
      curves.push([p, [p[0] + (right[0] - p[0]) / 2, p[1]], [right[0], right[1] + dir * rho], right]);
      curves.push([right, [right[0], right[1] - dir * k], [top[0] + k, top[1]], top]);
      curves.push([top, [top[0] - k, top[1]], [left[0], left[1] - dir * k], left]);
      curves.push([left, [left[0], left[1] + dir * rho], [q[0] - (q[0] - left[0]) / 3, q[1]], q]);
    } else {
      curves.push([p, [p[0] + dx / 3, p[1]], [q[0] - dx / 3, q[1]], q]);
    }
    endsAt.push(curves.length - 1);
  }

  const lengths = curves.map(cubicLength);
  const length = lengths.reduce((a, b) => a + b, 0);
  const cumulative: number[] = [];
  lengths.reduce((acc, l, i) => (cumulative[i] = acc + l), 0);
  // The first and last waypoints are the path's ends, not stops.
  const points: ThreadPoint[] = endsAt.slice(0, -1).map((ci) => ({ x: r(curves[ci][3][0]), y: r(curves[ci][3][1]), at: cumulative[ci] / length }));

  const d =
    `M${r(curves[0][0][0])} ${r(curves[0][0][1])}` +
    curves.map(([, a, b, e]) => ` C${r(a[0])} ${r(a[1])} ${r(b[0])} ${r(b[1])} ${r(e[0])} ${r(e[1])}`).join("");
  return { d, length, points };
}
