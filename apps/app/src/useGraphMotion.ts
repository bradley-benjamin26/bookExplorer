import type { Simulation } from "d3-force";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion, useSharedValue } from "react-native-reanimated";
import {
  CENTER_NODE_RADIUS,
  clampPoint,
  createDragSimulation,
  entryPositions,
  layoutGraph,
  NODE_RADIUS,
  placeEdgeLabels,
  type PositionedNode,
} from "./graphLayout";

/** True when a press lands so soon after a drag that it is the drag's own release. */
export function shouldSuppressPress(lastDragEndMs: number, nowMs: number): boolean {
  return nowMs - lastDragEndMs < 250;
}

const ENTRY_MS = 600;
const DRAG_ALPHA_TARGET = 0.15;

type Layout = ReturnType<typeof layoutGraph>;

// shortcut: re-renders the whole screen per tick; extract the Svg canvas into a memo component if large graphs stutter on device.
export function useGraphMotion(layout: Layout | null, centerId: string | undefined) {
  const reduceMotion = useReducedMotion();
  // Read through a ref so toggling the OS setting doesn't rebuild (and re-animate) the graph.
  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;
  const [frame, setFrame] = useState(0);
  const points = useSharedValue<{ x: number; y: number; r: number }[]>([]);
  const sim = useRef<Simulation<PositionedNode, undefined> | null>(null);
  const raf = useRef(0);
  const dragged = useRef<PositionedNode | null>(null);
  const lastEnd = useRef(0);

  // Pushes the mutated node positions to the UI-thread hit test and re-renders.
  const sync = (nodes: PositionedNode[], id: string) => {
    points.value = nodes.map((n) => ({ x: n.x, y: n.y, r: n.id === id ? CENTER_NODE_RADIUS : NODE_RADIUS }));
    setFrame((f) => f + 1);
  };

  // Layout effect, so the first paint already shows the nodes at the entry animation's start.
  useLayoutEffect(() => {
    if (!layout || !centerId) return;
    const { nodes } = layout;
    // Snapshot before anything mutates x/y: d3 and the animation share these node objects.
    const final = nodes.map((n) => ({ x: n.x, y: n.y }));
    const origin = final[nodes.findIndex((n) => n.id === centerId)];
    const simulation = createDragSimulation(nodes, layout.edges, { width: layout.contentWidth, height: layout.contentHeight }, centerId);
    simulation.on("tick", () => sync(nodes, centerId));
    sim.current = simulation;

    if (!reduceMotionRef.current && origin) {
      const place = (t: number) => entryPositions(final, origin, t).forEach((p, i) => Object.assign(nodes[i], p));
      place(0);
      let start: number | null = null;
      const step = (now: number) => {
        start ??= now;
        const t = Math.min(1, (now - start) / ENTRY_MS);
        place(t);
        sync(nodes, centerId);
        raf.current = t < 1 ? requestAnimationFrame(step) : 0;
      };
      raf.current = requestAnimationFrame(step);
    }
    sync(nodes, centerId);

    return () => {
      // Detach before stopping so a pending tick can't write into the next layout's render.
      simulation.on("tick", null);
      simulation.stop();
      // An unfinished entry leaves the layout's own nodes mid-flight; put them back so a re-run (StrictMode, same layout) snapshots the real final spots.
      if (raf.current) nodes.forEach((n, i) => Object.assign(n, final[i]));
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      sim.current = null;
      dragged.current = null;
    };
  }, [layout, centerId]);

  const edges = useMemo(
    () => (layout && centerId ? placeEdgeLabels(layout.nodes, layout.edges, centerId) : []),
    [frame, layout, centerId]
  );

  const dragStart = (index: number) => {
    const node = layout?.nodes[index];
    if (!sim.current || !node) return;
    // A drag takes over from the entry animation rather than fighting it.
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    dragged.current = node;
    sim.current.alphaTarget(DRAG_ALPHA_TARGET).restart();
  };

  const dragMove = (_index: number, x: number, y: number) => {
    const node = dragged.current;
    if (!node || !layout) return;
    // Pinned nodes skip the bounds force, so this is the only thing keeping the dragged node on the canvas.
    const c = clampPoint({ x, y }, { width: layout.contentWidth, height: layout.contentHeight });
    node.fx = c.x;
    node.fy = c.y;
  };

  const dragEnd = (_index: number) => {
    lastEnd.current = Date.now();
    const node = dragged.current;
    const simulation = sim.current;
    dragged.current = null;
    if (!node || !simulation || !layout || !centerId) return;
    // The center stays where it was dropped; other nodes rejoin the forces.
    if (node.id !== centerId) {
      node.fx = null;
      node.fy = null;
    }
    simulation.alphaTarget(0);
    if (reduceMotionRef.current) {
      simulation.stop();
      while (simulation.alpha() >= simulation.alphaMin()) simulation.tick();
      sync(layout.nodes, centerId);
    }
  };

  return {
    nodes: layout?.nodes ?? [],
    edges,
    points,
    dragStart,
    dragMove,
    dragEnd,
    lastDragEnd: () => lastEnd.current,
  };
}
