import { describe, expect, it } from "vitest";
import { threadGeometry } from "./threadGeometry";

type Seg = { start: [number, number]; c1: [number, number]; c2: [number, number]; end: [number, number] };

/** The cubic segments of a path made of one M and any number of C commands. */
function segments(d: string): Seg[] {
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const segs: Seg[] = [];
  let cur: [number, number] = [nums[0], nums[1]];
  for (let i = 2; i + 5 < nums.length; i += 6) {
    segs.push({ start: cur, c1: [nums[i], nums[i + 1]], c2: [nums[i + 2], nums[i + 3]], end: [nums[i + 4], nums[i + 5]] });
    cur = [nums[i + 4], nums[i + 5]];
  }
  return segs;
}

const at = (s: Seg, t: number): [number, number] => {
  const u = 1 - t;
  const f = (a: number, b: number, c: number, e: number) => u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * e;
  return [f(s.start[0], s.c1[0], s.c2[0], s.end[0]), f(s.start[1], s.c1[1], s.c2[1], s.end[1])];
};

const orient = (a: [number, number], b: [number, number], c: [number, number]) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
const cross = (a: [number, number], b: [number, number], c: [number, number], e: [number, number]) =>
  orient(a, b, c) !== orient(a, b, e) && orient(c, e, a) !== orient(c, e, b);

describe("threadGeometry", () => {
  const g = threadGeometry(320, 28, 4);

  it("puts the stops left to right inside the window, on a path that reaches each one", () => {
    expect(g.points).toHaveLength(4);
    g.points.forEach((p, i) => {
      expect(p.x).toBeGreaterThanOrEqual(8);
      expect(p.x).toBeLessThanOrEqual(312);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(28);
      if (i) expect(p.x).toBeGreaterThan(g.points[i - 1].x);
      if (i) expect(p.at).toBeGreaterThan(g.points[i - 1].at);
    });
    expect(g.points[0].at).toBeLessThan(0.1);
    expect(g.points[3].at).toBeGreaterThan(0.9);
  });

  it("is made of curves, not straight lines", () => {
    expect(g.d.startsWith("M")).toBe(true);
    expect(segments(g.d).length).toBeGreaterThanOrEqual(4);
    expect(g.d).not.toMatch(/L/);
  });

  it("loops: the line crosses itself exactly once", () => {
    const pts: [number, number][] = [];
    for (const sg of segments(g.d)) for (let t = 0; t < 1; t += 1 / 40) pts.push(at(sg, t));
    let crossings = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      for (let j = i + 2; j < pts.length - 1; j++) if (cross(pts[i], pts[i + 1], pts[j], pts[j + 1])) crossings++;
    }
    expect(crossings).toBeGreaterThan(0);
    expect(crossings).toBeLessThanOrEqual(3); // one crossing, seen by neighbouring sample edges
  });

  it("keeps the whole curve inside the box, at phone, small and wide widths (Review Focus 4)", () => {
    for (const w of [240, 320, 1200]) {
      const geo = threadGeometry(w, 28, 4);
      for (const s of segments(geo.d)) {
        for (let t = 0; t <= 1; t += 0.05) {
          const [x, y] = at(s, t);
          expect(x).toBeGreaterThanOrEqual(-0.5);
          expect(x).toBeLessThanOrEqual(w + 0.5);
          expect(y).toBeGreaterThanOrEqual(-0.5);
          expect(y).toBeLessThanOrEqual(28.5);
        }
      }
      expect(geo.length).toBeGreaterThan(w);
    }
  });

  it("centres stops in equal columns when given an inset of a sixth", () => {
    const geo = threadGeometry(300, 96, 3, 50);
    expect(geo.points.map((p) => Math.round(p.x))).toEqual([50, 150, 250]);
  });

  it("is deterministic", () => {
    expect(threadGeometry(320, 28, 4).d).toBe(g.d);
  });

  it("takes several loops of different sizes, like the header thread", () => {
    const loops = [{ gap: 1, scale: 0.55 }, { gap: 2 }, { gap: 3, scale: 0.7 }];
    const geo = threadGeometry(120, 22, 4, 8, loops);
    expect(geo.points).toHaveLength(4);
    geo.points.forEach((p, i) => i && expect(p.x).toBeGreaterThan(geo.points[i - 1].x));
    const pts: [number, number][] = [];
    for (const sg of segments(geo.d)) {
      for (let t = 0; t <= 1; t += 1 / 40) {
        const [x, y] = at(sg, t);
        expect(x).toBeGreaterThanOrEqual(-0.5);
        expect(x).toBeLessThanOrEqual(120.5);
        expect(y).toBeGreaterThanOrEqual(-0.5);
        expect(y).toBeLessThanOrEqual(22.5);
        pts.push([x, y]);
      }
    }
    // Each loop is a separate crossing: well apart in x, so count the crossings' distinct x positions.
    const xs: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      for (let j = i + 2; j < pts.length - 1; j++) if (cross(pts[i], pts[i + 1], pts[j], pts[j + 1])) xs.push(pts[i][0]);
    }
    const distinct = xs.filter((x, i) => i === 0 || Math.abs(x - xs[i - 1]) > 4).length;
    expect(distinct).toBe(3);
  });

  it("draws the default single loop when no loops are given", () => {
    expect(threadGeometry(320, 28, 4, 8, undefined).d).toBe(g.d);
  });

  it("can be drawn tidy: every stop on one baseline, identical loops between them", () => {
    const loops = [{ gap: 1, scale: 0.8 }, { gap: 2, scale: 0.8 }, { gap: 3, scale: 0.8 }];
    const geo = threadGeometry(120, 20, 4, 6, loops, { wander: 0, baseline: 17 });
    expect(new Set(geo.points.map((p) => p.y))).toEqual(new Set([17]));
    const pts: [number, number][] = [];
    for (const sg of segments(geo.d)) {
      for (let t = 0; t <= 1; t += 1 / 40) {
        const [x, y] = at(sg, t);
        expect(y).toBeGreaterThanOrEqual(-0.5);
        expect(y).toBeLessThanOrEqual(20.5);
        pts.push([x, y]);
      }
    }
    const xs: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      for (let j = i + 2; j < pts.length - 1; j++) if (cross(pts[i], pts[i + 1], pts[j], pts[j + 1])) xs.push(pts[i][0]);
    }
    expect(xs.filter((x, i) => i === 0 || Math.abs(x - xs[i - 1]) > 4)).toHaveLength(3);
  });

  it("can hang a loop below the line while the others rise above it", () => {
    const loops = [{ gap: 1, scale: 0.8 }, { gap: 2, scale: 0.8, down: true }, { gap: 3, scale: 0.8 }];
    const geo = threadGeometry(120, 26, 4, 6, loops, { wander: 0, baseline: 13 });
    const [, s1, s2] = geo.points;
    let belowMiddle = 0;
    let belowElsewhere = 0;
    let top = Infinity;
    let bottom = -Infinity;
    for (const sg of segments(geo.d)) {
      for (let t = 0; t <= 1; t += 1 / 40) {
        const [x, y] = at(sg, t);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        if (x > s1.x && x < s2.x) belowMiddle = Math.max(belowMiddle, y - 13);
        else belowElsewhere = Math.max(belowElsewhere, y - 13);
      }
    }
    expect(belowMiddle).toBeGreaterThan(8);
    expect(belowElsewhere).toBeLessThanOrEqual(0.5);
    expect(top).toBeGreaterThanOrEqual(-0.5);
    expect(bottom).toBeLessThanOrEqual(26.5);
  });
});

