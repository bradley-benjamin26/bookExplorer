import { useQuery } from "@tanstack/react-query";
import type { Graph, GraphNode } from "@book-explorer/shared";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from "d3-force";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Fragment, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Circle, Line, Text as SvgText } from "react-native-svg";
import { fetchGraph, type GraphCenterType } from "../../../src/api/client";
import { ErrorState } from "../../../src/components/ErrorState";
import { routes } from "../../../src/navigation";
import { CONTENT_MAX_WIDTH, useTheme, useThemedStyles, type Theme, type ThemeColors } from "../../../src/theme";

function nodeColors(colors: ThemeColors): Record<GraphNode["type"], string> {
  return {
    author: colors.graphAuthor,
    work: colors.graphWork,
    subject: colors.graphSubject,
    // Matches the Genres chip color on the book/work detail pages, so a
    // genre reads as the same kind of thing whether it's a chip or a node.
    genre: colors.graphGenre,
    // The same color this node's destination — the Editions section's own
    // highlight — uses on the work page, so the two visibly read as the
    // same thing rather than an arbitrary extra graph color.
    editions: colors.warning,
  };
}

const NODE_LABELS: Record<GraphNode["type"], string> = {
  author: "Author",
  work: "Book",
  subject: "Subject",
  genre: "Genre",
  editions: "Editions",
};

// Each edge already reads correctly as "source <label> target" — direction
// is baked in when the server builds it (e.g. "influencedBy" always means
// the source was influenced by the target, regardless of which way that
// reads on Wikidata) — so the label just needs to name the relationship.
const RELATION_LABELS: Record<string, string> = {
  influencedBy: "influenced by",
  notableWork: "wrote",
  wrote: "wrote",
  wroteAs: "wrote (pen name)",
  author: "wrote",
  movement: "movement",
  subject: "about",
  genre: "is",
  hasBook: "includes",
  broader: "broader topic",
  editions: "has",
};

const NODE_RADIUS = 26;
const CENTER_NODE_RADIUS = 34;
const SIMULATION_TICKS = 300;
const LABEL_MAX_CHARS_PER_LINE = 16;
const LABEL_MAX_LINES = 3;
const LABEL_LINE_HEIGHT = 12;

// SvgText has no built-in wrapping, so a long node label (an author's full
// name, a multi-word subject) is greedily broken into lines here instead of
// being cut short with a mid-word ellipsis. Capped at LABEL_MAX_LINES so a
// pathologically long label still can't grow the label taller than the
// space between nodes — the last line gets an ellipsis instead of overflowing.
function wrapLabel(label: string): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > LABEL_MAX_CHARS_PER_LINE && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  if (lines.length <= LABEL_MAX_LINES) return lines;
  const truncated = lines.slice(0, LABEL_MAX_LINES);
  truncated[LABEL_MAX_LINES - 1] = `${truncated[LABEL_MAX_LINES - 1]}…`;
  return truncated;
}

interface PositionedNode extends GraphNode {
  x: number;
  y: number;
}

interface PositionedEdge {
  source: PositionedNode;
  target: PositionedNode;
  relation: string;
}

// The lines-and-labels a sighted user reads visually (source, connecting
// line, relation label, target) have no equivalent for a screen reader
// landing on one node in isolation, so each node's accessible description
// spells out every edge touching it using the same "source relation target"
// phrasing the diagram itself uses.
function describeNodeRelations(nodeId: string, edges: PositionedEdge[]): string {
  return edges
    .filter((edge) => edge.source.id === nodeId || edge.target.id === nodeId)
    .map((edge) => `${edge.source.label} ${RELATION_LABELS[edge.relation] ?? edge.relation} ${edge.target.label}`)
    .join(". ");
}

interface Center {
  type: GraphNode["type"];
  id: string;
}

/** Runs d3-force synchronously to a resting layout, rather than animating it — the
 * graphs here are small (well under 50 nodes) so a few hundred ticks converge instantly. */
function layoutGraph(graph: Graph, width: number, height: number) {
  const nodes = graph.nodes.map((n) => ({ ...n })) as (GraphNode & { x: number; y: number })[];
  const links = graph.edges.map((e) => ({ ...e }));

  const simulation = forceSimulation(nodes as never[])
    // Pushed apart harder, and linked further apart, than the tighter
    // defaults this started with — worth it for legibility even on the
    // busiest graphs (an author's full bibliography can be 20+ nodes),
    // at the cost of needing more scrolling/panning to see it all at once.
    .force("charge", forceManyBody().strength(-420))
    .force(
      "link",
      forceLink(links as never[])
        .id((d) => (d as GraphNode).id)
        .distance(170)
    )
    .force("center", forceCenter(width / 2, height / 2))
    // Padded enough to clear a full 3-line wrapped label below a node (see
    // wrapLabel), not just the circle itself — otherwise two nodes placed
    // close together can end up with one's label overlapping the node below it.
    .force("collide", forceCollide(NODE_RADIUS + 16 + LABEL_MAX_LINES * LABEL_LINE_HEIGHT))
    .stop();

  for (let i = 0; i < SIMULATION_TICKS; i++) simulation.tick();

  // d3-force should always leave every node with finite x/y after ticking,
  // but a node that failed to resolve into forceLink's id map (e.g. a
  // malformed edge slipping past the server's own de-dup) is left with NaN
  // coordinates instead of throwing — passing NaN into <Circle>/<Line> as a
  // web SVG attribute crashes react-native-svg's renderer, so such nodes are
  // dropped here rather than trusting the simulation output blindly.
  const isFinitePoint = (n: { x: number; y: number }) => Number.isFinite(n.x) && Number.isFinite(n.y);
  const positionedNodes = (nodes as PositionedNode[]).filter(isFinitePoint);
  // forceLink mutates each link's source/target from an id string into the
  // matching node object once the simulation has run, so they're safe to
  // read directly as positioned nodes here.
  const positionedEdges = (links as unknown as PositionedEdge[]).filter(
    (e) => isFinitePoint(e.source) && isFinitePoint(e.target)
  );

  // A busy graph (20+ nodes, spread apart by the charge/link forces above)
  // routinely lands nodes outside the [0, width] x [0, height] box
  // forceCenter aims for — those nodes would otherwise be cropped by the
  // fixed-size graphArea/Svg below. Bounds are measured generously off the
  // largest node radius plus a full wrapped label's height, then everything
  // is shifted so the leftmost/topmost edge sits at 0, and the graph area
  // grows to fit — scrollable, rather than clipped — whenever that's bigger
  // than the viewport it was originally sized for.
  const labelClearance = 14 + LABEL_MAX_LINES * LABEL_LINE_HEIGHT;
  const allPoints = [...positionedNodes, ...positionedEdges.flatMap((e) => [e.source, e.target])];
  const minX = allPoints.length ? Math.min(...allPoints.map((n) => n.x - CENTER_NODE_RADIUS)) : 0;
  const minY = allPoints.length ? Math.min(...allPoints.map((n) => n.y - CENTER_NODE_RADIUS)) : 0;
  const maxX = allPoints.length ? Math.max(...allPoints.map((n) => n.x + CENTER_NODE_RADIUS)) : width;
  const maxY = allPoints.length ? Math.max(...allPoints.map((n) => n.y + CENTER_NODE_RADIUS + labelClearance)) : height;

  const offsetX = Math.max(0, -minX);
  const offsetY = Math.max(0, -minY);
  if (offsetX > 0 || offsetY > 0) {
    // Shift each node object once — edges reference these same node objects
    // as their source/target (not copies), so mutating positionedNodes here
    // moves the edges too; iterating allPoints instead would double-apply
    // the offset to any node touched by more than one edge.
    for (const node of positionedNodes) {
      node.x += offsetX;
      node.y += offsetY;
    }
  }

  const contentWidth = Math.max(width, maxX - minX);
  const contentHeight = Math.max(height, maxY - minY);

  return { nodes: positionedNodes, edges: positionedEdges, contentWidth, contentHeight };
}

function parseNodeId(id: string): Center {
  const [type, ...rest] = id.split(":");
  return { type: type as GraphNode["type"], id: rest.join(":") };
}

export default function GraphExplorer() {
  const { type, id } = useLocalSearchParams<{ type: string; id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const NODE_COLORS = useMemo(() => nodeColors(theme.colors), [theme.colors]);
  const { width: windowWidth, height } = useWindowDimensions();
  // The screen itself lives inside the app-wide max-width shell (see
  // _layout.tsx) — `useWindowDimensions` reports the full window/device
  // width regardless, so a wide desktop window would otherwise lay the
  // graph out (and size its <Svg> canvas) far wider than what's actually
  // visible, hiding most of it off the edge of the capped content area.
  const width = Math.min(windowWidth, CONTENT_MAX_WIDTH);
  // Clamped so a very short viewport (small split-screen window, landscape
  // phone) can't push this negative, which would hand d3-force and <Svg> a
  // degenerate size instead of just a cramped one.
  const canvasHeight = Math.max(height - 140, 300);

  // Tapping a node used to push a whole new screen for its graph. It now
  // re-centers this same screen instead — feels like panning around one
  // continuous map rather than drilling through a stack of pages — with
  // `history` as a small in-screen back-stack so a "Back" affordance can
  // still step outward one ring at a time. Only entering the graph fresh
  // (e.g. the "View as Graph" button elsewhere) is a real navigation.
  const [center, setCenter] = useState<Center | null>(type && id ? { type: type as GraphNode["type"], id } : null);
  const [history, setHistory] = useState<Center[]>([]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["graph", center?.type, center?.id],
    // Never actually "genre" here — routes.graph() (the only way center gets
    // set from outside) and handleNodePress below (the only way it gets set
    // from within) both only ever produce author/work/subject centers, but
    // Center's own `type` stays the full GraphNode type since it's also used
    // for genre *nodes* passing through parseNodeId before that check runs.
    queryFn: () => fetchGraph(center!.type as GraphCenterType, center!.id),
    enabled: !!center,
  });

  const layout = useMemo(() => {
    if (!data) return null;
    return layoutGraph(data, width, canvasHeight);
  }, [data, width, canvasHeight]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.link} />
      </View>
    );
  }

  if (isError || !data || !layout || !center) {
    return <ErrorState message={error instanceof Error ? error.message : `No graph found for ${type}/${id}`} />;
  }

  const handleNodePress = (node: PositionedNode) => {
    if (!node.navigable) return;
    const next = parseNodeId(node.id);

    // Genre nodes have no graph of their own to pan into — a genre is really
    // just an Open Library subject slug wearing a different label and color,
    // and the server only knows how to build a graph for author/work/subject
    // ids — so tapping one always jumps straight to the Subject browse
    // screen instead of joining the recenter-the-graph behavior every other
    // non-center node gets.
    if (next.type === "genre") {
      router.push(routes.subject(next.id));
      return;
    }

    // Likewise has no graph of its own — it's a signpost pointing at the
    // Editions section on its own work's page (see buildWorkGraph), not a
    // real browsable node, so tapping it jumps straight there instead of
    // recentering.
    if (next.type === "editions") {
      router.push(routes.work(next.id, { highlight: "editions" }));
      return;
    }

    if (node.id !== data.centerId) {
      setHistory((h) => [...h, center]);
      setCenter(next);
      return;
    }
    if (next.type === "author") router.push(routes.author(next.id));
    else if (next.type === "subject") router.push(routes.subject(next.id));
    else router.push(routes.work(next.id));
  };

  const handleBack = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      setCenter(h[h.length - 1]);
      return h.slice(0, -1);
    });
  };

  // Screen readers can't derive meaning from an SVG circle's position, so the
  // visual graph is hidden from them entirely and each node instead gets a
  // real accessible button, absolutely positioned over its circle, in the
  // same reading order sighted users would explore outward from the center.
  // A graph with nothing but its own center node happens for a genuinely
  // thin record — an author with no Wikidata relations and no catalogued
  // Open Library works, say — rather than a fetch failure, so it's shown as
  // its own explicit "nothing here" state rather than an empty canvas with
  // a lone floating circle and no explanation.
  if (layout.nodes.length <= 1) {
    const centerLabel = layout.nodes[0]?.label ?? "this";
    return (
      <View style={styles.center}>
        <Text style={styles.emptyGraphText}>No linked connections found for {centerLabel} yet.</Text>
      </View>
    );
  }

  const orderedNodes = [...layout.nodes].sort((a, b) =>
    a.id === data.centerId ? -1 : b.id === data.centerId ? 1 : 0
  );

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>
        Tap a node to explore it, or swipe through them with a screen reader — activate the highlighted center node
        for full details.
      </Text>
      <View style={styles.legend}>
        {(Object.keys(NODE_COLORS) as GraphNode["type"][]).map((nodeType) => (
          <View key={nodeType} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: NODE_COLORS[nodeType] }]} />
            <Text style={styles.legendLabel}>{NODE_LABELS[nodeType]}</Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.legendSwatchFaded]} />
          <Text style={styles.legendLabel}>Not yet linked</Text>
        </View>
      </View>
      {history.length > 0 && (
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          hitSlop={8}
        >
          <Text style={styles.backButtonText}>‹ Back</Text>
        </Pressable>
      )}
      <ScrollView
        horizontal
        style={{ width }}
        contentContainerStyle={{ width: layout.contentWidth }}
        showsHorizontalScrollIndicator={layout.contentWidth > width}
      >
        <ScrollView
          style={{ height: canvasHeight, width: layout.contentWidth }}
          contentContainerStyle={{ height: layout.contentHeight }}
          showsVerticalScrollIndicator={layout.contentHeight > canvasHeight}
        >
          <View style={[styles.graphArea, { width: layout.contentWidth, height: layout.contentHeight }]}>
            <View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Svg width={layout.contentWidth} height={layout.contentHeight}>
            {layout.edges.map((edge, i) => (
              <Line
                key={i}
                x1={edge.source.x}
                y1={edge.source.y}
                x2={edge.target.x}
                y2={edge.target.y}
                stroke={theme.colors.border}
                strokeWidth={1.5}
              />
            ))}
            {layout.edges.map((edge, i) => {
              const label = RELATION_LABELS[edge.relation] ?? edge.relation;
              const midX = (edge.source.x + edge.target.x) / 2;
              const midY = (edge.source.y + edge.target.y) / 2;
              return (
                // Rendered twice at the same spot: a thick "stroke" pass
                // (matching the page background) first so the text stays
                // legible where it crosses other lines or sits close to a
                // node, then the actual text on top of it.
                <Fragment key={i}>
                  <SvgText
                    x={midX}
                    y={midY}
                    fontSize={9.5}
                    fill={theme.colors.textMuted}
                    stroke={theme.colors.background}
                    strokeWidth={3}
                    textAnchor="middle"
                  >
                    {label}
                  </SvgText>
                  <SvgText x={midX} y={midY} fontSize={9.5} fill={theme.colors.textMuted} textAnchor="middle">
                    {label}
                  </SvgText>
                </Fragment>
              );
            })}
            {layout.nodes.map((node) => {
              const isCenter = node.id === data.centerId;
              const radius = isCenter ? CENTER_NODE_RADIUS : NODE_RADIUS;
              const lines = wrapLabel(node.label);
              const firstLineY = node.y + radius + 14;
              return (
                <Fragment key={node.id}>
                  <Circle
                    cx={node.x}
                    cy={node.y}
                    r={radius}
                    fill={NODE_COLORS[node.type]}
                    opacity={node.navigable ? 1 : 0.4}
                    stroke={isCenter ? theme.colors.text : "none"}
                    strokeWidth={isCenter ? 2 : 0}
                  />
                  {lines.map((line, i) => (
                    <SvgText
                      key={i}
                      x={node.x}
                      y={firstLineY + i * LABEL_LINE_HEIGHT}
                      fontSize={11}
                      fill={theme.colors.text}
                      textAnchor="middle"
                    >
                      {line}
                    </SvgText>
                  ))}
                </Fragment>
              );
            })}
          </Svg>
        </View>

        {orderedNodes.map((node) => {
          const isCenter = node.id === data.centerId;
          const radius = isCenter ? CENTER_NODE_RADIUS : NODE_RADIUS;
          const relations = describeNodeRelations(node.id, layout.edges);
          const label = [
            `${node.label}, ${NODE_LABELS[node.type]}`,
            isCenter && "currently centered",
            relations,
            !node.navigable && "not yet linked",
          ]
            .filter(Boolean)
            .join(". ");

          return (
            <Pressable
              key={node.id}
              onPress={() => handleNodePress(node)}
              disabled={!node.navigable}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityHint={
                node.navigable
                  ? isCenter
                    ? "Opens full details for this item"
                    : "Re-centers the graph on this item"
                  : undefined
              }
              accessibilityState={{ disabled: !node.navigable, selected: isCenter }}
              style={{
                position: "absolute",
                left: node.x - radius,
                top: node.y - radius,
                width: radius * 2,
                height: radius * 2,
                borderRadius: radius,
              }}
              />
          );
        })}
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

function createStyles({ colors }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    emptyGraphText: { fontSize: 15, color: colors.textMuted, textAlign: "center" },
    hint: { textAlign: "center", fontSize: 13, color: colors.textMuted, paddingVertical: 10, paddingHorizontal: 20 },
    legend: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: 16,
      paddingBottom: 12,
      paddingHorizontal: 20,
    },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    legendSwatch: { width: 12, height: 12, borderRadius: 6 },
    legendSwatchFaded: { backgroundColor: colors.graphSubject, opacity: 0.4 },
    legendLabel: { fontSize: 12, color: colors.textMuted },
    backButton: { alignSelf: "center", paddingVertical: 4, paddingHorizontal: 12, marginBottom: 8 },
    graphArea: { position: "relative" },
    pressed: { opacity: 0.6 },
    backButtonText: { color: colors.link, fontSize: 14, fontWeight: "600" },
  });
}
