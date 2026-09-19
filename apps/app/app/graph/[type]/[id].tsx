import { useQuery } from "@tanstack/react-query";
import type { Graph, GraphNode } from "@book-explorer/shared";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from "d3-force";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Fragment, useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Circle, Line, Text as SvgText } from "react-native-svg";
import { fetchGraph } from "../../../src/api/client";
import { routes } from "../../../src/navigation";

const NODE_COLORS: Record<GraphNode["type"], string> = {
  author: "#3346a8",
  work: "#1a7a4c",
  subject: "#a8593c",
};

const NODE_RADIUS = 26;
const CENTER_NODE_RADIUS = 34;
const SIMULATION_TICKS = 300;

interface PositionedNode extends GraphNode {
  x: number;
  y: number;
}

interface PositionedEdge {
  source: PositionedNode;
  target: PositionedNode;
  relation: string;
}

/** Runs d3-force synchronously to a resting layout, rather than animating it — the
 * graphs here are small (well under 50 nodes) so a few hundred ticks converge instantly. */
function layoutGraph(graph: Graph, width: number, height: number) {
  const nodes = graph.nodes.map((n) => ({ ...n })) as (GraphNode & { x: number; y: number })[];
  const links = graph.edges.map((e) => ({ ...e }));

  const simulation = forceSimulation(nodes as never[])
    .force("charge", forceManyBody().strength(-220))
    .force(
      "link",
      forceLink(links as never[])
        .id((d) => (d as GraphNode).id)
        .distance(100)
    )
    .force("center", forceCenter(width / 2, height / 2))
    .force("collide", forceCollide(NODE_RADIUS + 8))
    .stop();

  for (let i = 0; i < SIMULATION_TICKS; i++) simulation.tick();

  const positionedNodes = nodes as PositionedNode[];
  // forceLink mutates each link's source/target from an id string into the
  // matching node object once the simulation has run, so they're safe to
  // read directly as positioned nodes here.
  const positionedEdges = links as unknown as PositionedEdge[];

  return { nodes: positionedNodes, edges: positionedEdges };
}

function parseNodeId(id: string): { type: GraphNode["type"]; rawId: string } {
  const [type, ...rest] = id.split(":");
  return { type: type as GraphNode["type"], rawId: rest.join(":") };
}

export default function GraphExplorer() {
  const { type, id } = useLocalSearchParams<{ type: string; id: string }>();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  // Clamped so a very short viewport (small split-screen window, landscape
  // phone) can't push this negative, which would hand d3-force and <Svg> a
  // degenerate size instead of just a cramped one.
  const canvasHeight = Math.max(height - 140, 300);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["graph", type, id],
    queryFn: () => fetchGraph(type as GraphNode["type"], id),
    enabled: !!type && !!id,
  });

  const layout = useMemo(() => {
    if (!data) return null;
    return layoutGraph(data, width, canvasHeight);
  }, [data, width, canvasHeight]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isError || !data || !layout) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {error instanceof Error ? error.message : `No graph found for ${type}/${id}`}
        </Text>
      </View>
    );
  }

  const handleNodePress = (node: PositionedNode) => {
    if (!node.navigable) return;
    const { type: nodeType, rawId } = parseNodeId(node.id);

    if (node.id !== data.centerId) {
      router.push(routes.graph(nodeType, rawId));
      return;
    }
    if (nodeType === "author") router.push(routes.author(rawId));
    else if (nodeType === "subject") router.push(routes.subject(rawId));
    else router.push(routes.work(rawId));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>Tap a node to explore it — tap the highlighted center node for full details.</Text>
      <Svg width={width} height={canvasHeight}>
        {layout.edges.map((edge, i) => (
          <Line
            key={i}
            x1={edge.source.x}
            y1={edge.source.y}
            x2={edge.target.x}
            y2={edge.target.y}
            stroke="#ccc"
            strokeWidth={1.5}
          />
        ))}
        {layout.nodes.map((node) => {
          const isCenter = node.id === data.centerId;
          const radius = isCenter ? CENTER_NODE_RADIUS : NODE_RADIUS;
          return (
            <Fragment key={node.id}>
              <Circle
                cx={node.x}
                cy={node.y}
                r={radius}
                fill={NODE_COLORS[node.type]}
                opacity={node.navigable ? 1 : 0.4}
                stroke={isCenter ? "#111" : "none"}
                strokeWidth={isCenter ? 2 : 0}
                onPress={() => handleNodePress(node)}
              />
              <SvgText
                x={node.x}
                y={node.y + radius + 14}
                fontSize={11}
                fill="#333"
                textAnchor="middle"
                onPress={() => handleNodePress(node)}
              >
                {node.label.length > 20 ? `${node.label.slice(0, 18)}…` : node.label}
              </SvgText>
            </Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { textAlign: "center", fontSize: 16, color: "#a33" },
  hint: { textAlign: "center", fontSize: 13, color: "#888", paddingVertical: 10, paddingHorizontal: 20 },
});
