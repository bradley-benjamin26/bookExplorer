import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Graph, GraphNode } from "@book-explorer/shared";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Check, ChevronLeft, ChevronRight, Crosshair, Maximize, ZoomIn, ZoomOut } from "lucide-react-native";
import { Fragment, useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Line, Rect, Text as SvgText } from "react-native-svg";
import { fetchGraph, fetchPath, type GraphCenterType } from "../../../src/api/client";
import { exploringTitle } from "../../../src/graphTitle";
import { ErrorState } from "../../../src/components/ErrorState";
import { Button } from "../../../src/components/Button";
import { OfflineBanner } from "../../../src/components/OfflineBanner";
import { ShareButton } from "../../../src/components/ShareButton";
import { titleRef } from "../../../src/webTitle";
import { legendEntries, NODE_LABELS, nodeRelations, pathAsGraph, relationLabel } from "../../../src/graphLabels";
import { applyGraphFilter, filterFromParams, filterToParams, isFiltered, shouldAutoOpenList, toggle, type GraphFilter } from "../../../src/graphFilters";
import { nodeHref, routes } from "../../../src/navigation";
import { CONTENT_MAX_WIDTH, useTheme, useThemedStyles, type Theme, type ThemeColors } from "../../../src/theme";
import { CENTER_NODE_RADIUS, LABEL_LINE_HEIGHT, layoutGraph, NODE_RADIUS, PILL_HEIGHT, shortenEdge, wrapLabel, type Center, type PositionedNode } from "../../../src/graphLayout";

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


// How far the user can zoom in/out, and the scale window over which relation
// labels fade in — below MIN they're fully transparent (too crowded to read,
// and the loosened layout below hasn't given them room yet), fully opaque by
// LABEL_FADE_IN_SCALE so a quick pinch past that point doesn't feel laggy.
const MIN_SCALE = 0.25;
const MAX_SCALE = 3;
const LABEL_FADE_OUT_SCALE = 1.0;
const LABEL_FADE_IN_SCALE = 1.3;
// Plain scroll-to-zoom (no modifier key) matches common map/canvas
// conventions on web, where there's no pinch gesture from a trackpad/mouse.
const WHEEL_ZOOM_SPEED = 0.0015;
const DOUBLE_TAP_ZOOM_STEP = 1.5;

const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedSvgText = Animated.createAnimatedComponent(SvgText);


function parseNodeId(id: string): Center {
  const [type, ...rest] = id.split(":");
  return { type: type as GraphNode["type"], id: rest.join(":") };
}

export default function GraphExplorer() {
  const { type, id, hideTypes, hideRelations, pathTo, pathIndex } = useLocalSearchParams<{
    type: string;
    id: string;
    hideTypes?: string;
    hideRelations?: string;
    pathTo?: string;
    pathIndex?: string;
  }>();
  const queryClient = useQueryClient();
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
  // Until the viewport has been measured (below), a rough guess at the space
  // left over by the header, legend and footer; once it has, the real height.
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const canvasHeight = measuredHeight ?? Math.max(height - 140, 300);

  // Tapping a node used to push a whole new screen for its graph. It now
  // re-centers this same screen instead — feels like panning around one
  // continuous map rather than drilling through a stack of pages — with
  // `history` as a small in-screen back-stack so a "Back" affordance can
  // still step outward one ring at a time. Only entering the graph fresh
  // (e.g. the "View as Graph" button elsewhere) is a real navigation.
  const [center, setCenter] = useState<Center | null>(type && id ? { type: type as GraphNode["type"], id } : null);
  const [history, setHistory] = useState<Center[]>([]);

  // Opened from Find Connection: the starting view is just the path, read from
  // the same cached query that screen ran (a search is costly and rate-limited).
  // Tapping a node re-centres to a normal graph; stepping back returns here.
  const showPath = !!pathTo && history.length === 0 && center?.type === type && center?.id === id;
  const pathFrom = `${type}:${id}`;
  const { data, isLoading, isError, error, dataUpdatedAt } = useQuery({
    queryKey: showPath ? ["pathGraph", pathFrom, pathTo, pathIndex] : ["graph", center?.type, center?.id],
    // Never actually "genre" here — routes.graph() (the only way center gets
    // set from outside) and handleNodePress below (the only way it gets set
    // from within) both only ever produce author/work/subject centers, but
    // Center's own `type` stays the full GraphNode type since it's also used
    // for genre *nodes* passing through parseNodeId before that check runs.
    queryFn: showPath
      ? () =>
          queryClient
            .fetchQuery({
              queryKey: ["path", pathFrom, pathTo],
              queryFn: ({ signal }) => fetchPath(pathFrom, pathTo!, signal),
              staleTime: Infinity,
            })
            .then((result) => pathAsGraph(result, Number(pathIndex) || 0))
      : () => fetchGraph(center!.type as GraphCenterType, center!.id),
    retry: showPath ? false : 3,
    enabled: !!center,
  });

  // Filters live in the route query (so shared links restore them) and are mirrored in state for instant updates.
  const [filter, setFilter] = useState<GraphFilter>(() => filterFromParams({ hideTypes, hideRelations }));
  const [filterOpen, setFilterOpen] = useState(false);
  const [showList, setShowList] = useState(false);
  const [listChosen, setListChosen] = useState(false);
  // Screen-reader users can't use the canvas, so open the list for them, but never override the user's own toggle.
  useEffect(() => {
    if (listChosen) return;
    let cancelled = false;
    const apply = (on: boolean) => {
      if (!cancelled && shouldAutoOpenList(Platform.OS, on, listChosen)) setShowList(true);
    };
    AccessibilityInfo.isScreenReaderEnabled().then(apply);
    const sub = AccessibilityInfo.addEventListener("screenReaderChanged", apply);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [listChosen]);
  const updateFilter = (next: GraphFilter) => {
    setFilter(next);
    const p = filterToParams(next);
    router.setParams({ hideTypes: p.hideTypes, hideRelations: p.hideRelations });
  };
  const visible = useMemo(() => (data ? applyGraphFilter(data, filter) : null), [data, filter]);

  const layout = useMemo(() => {
    if (!visible) return null;
    return layoutGraph(visible, width, canvasHeight);
  }, [visible, width, canvasHeight]);

  // Shared transform for the whole canvas: both the SVG rendering layer and
  // the accessible Pressable overlay are children of one Animated.View (see
  // the render below) carrying this single scale/translate, so a tap lands
  // on the right node at any zoom/pan state without keeping two layers'
  // math independently in sync.
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  // Gesture worklets run off the JS thread and can't close over fresh
  // `layout`/`width`/`canvasHeight` values directly — mirrored into shared
  // values so the pan-clamping math below always reads the current content
  // size without the gesture handlers needing to be torn down and rebuilt
  // every time the graph data (and thus content size) changes.
  const contentWidth = useSharedValue(width);
  const contentHeight = useSharedValue(height);
  const viewportWidth = useSharedValue(width);
  const viewportHeight = useSharedValue(canvasHeight);

  const centerNode = layout?.nodes.find((n) => n.id === data?.centerId);
  useEffect(() => {
    if (!layout || !centerNode) return;
    contentWidth.value = layout.contentWidth;
    contentHeight.value = layout.contentHeight;
    viewportWidth.value = width;
    viewportHeight.value = canvasHeight;
    // Re-centering on a new node (tap-to-recenter) or arriving fresh should
    // bring that center node into view rather than leaving the transform
    // wherever the previous graph's pan/zoom left it — the content size and
    // node positions are entirely different after a recenter re-layout.
    resetView();
  }, [data?.centerId, layout?.contentWidth, layout?.contentHeight]);

  // Starts (and, for the reset button, returns to) zoomed out just far enough
  // to show the whole graph — never past MIN_SCALE, never magnified — centered,
  // instead of cropping outer nodes.
  function resetView() {
    if (!layout) return;
    const fit = Math.min(1, width / layout.contentWidth, canvasHeight / layout.contentHeight);
    const initial = Math.max(MIN_SCALE, fit);
    scale.value = initial;
    translateX.value = (width - layout.contentWidth * initial) / 2;
    translateY.value = (canvasHeight - layout.contentHeight * initial) / 2;
    clampTranslation(initial);
  }

  // The buttons zoom about the middle of the viewport, where a pinch or the
  // wheel would zoom about the fingers/cursor.
  const zoomByStep = (factor: number) => zoomAbout(scale.value * factor, width / 2, canvasHeight / 2);

  // The canvas is transformed from its top-left corner (see styles.graphArea),
  // so a canvas point p lands at translate + scale * p on screen. The canvas
  // can't be dragged so far that empty viewport shows beside it (or, when it's
  // smaller than the viewport, so far that it leaves the viewport).
  function clampTranslation(s: number) {
    "worklet";
    const slackX = viewportWidth.value - contentWidth.value * s;
    const slackY = viewportHeight.value - contentHeight.value * s;
    translateX.value = Math.min(Math.max(0, slackX), Math.max(Math.min(0, slackX), translateX.value));
    translateY.value = Math.min(Math.max(0, slackY), Math.max(Math.min(0, slackY), translateY.value));
  }

  // Zooms to `next` while keeping the canvas point under (focalX, focalY)
  // fixed on screen, so zooming goes toward the fingers/cursor instead of
  // drifting toward the canvas's own center.
  function zoomAbout(next: number, focalX: number, focalY: number) {
    "worklet";
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    const ratio = clamped / scale.value;
    translateX.value = focalX - (focalX - translateX.value) * ratio;
    translateY.value = focalY - (focalY - translateY.value) * ratio;
    scale.value = clamped;
    clampTranslation(clamped);
  }

  const pinchStartScale = useSharedValue(1);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      pinchStartScale.value = scale.value;
    })
    .onUpdate((e) => {
      zoomAbout(pinchStartScale.value * e.scale, e.focalX, e.focalY);
    });

  const panGesture = Gesture.Pan()
    // Node taps go through a plain RN Pressable (the accessible overlay),
    // which has no built-in movement tolerance of its own — without a
    // minimum distance here, Pan would steal every tap's initial pixel of
    // movement before the Pressable ever sees a press, so taps would stop
    // working under this gesture detector.
    .minDistance(10)
    .onStart(() => {
      panStartX.value = translateX.value;
      panStartY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateX.value = panStartX.value + e.translationX;
      translateY.value = panStartY.value + e.translationY;
      clampTranslation(scale.value);
    });

  // Trackpad/mouse equivalent for pinch, since Gesture.Pinch() only fires
  // from an actual two-finger touch gesture and react-native-gesture-handler's
  // web Pan handler doesn't surface plain mouse-wheel deltas at all — so this
  // reads the native wheel event directly (ctrl/cmd+scroll or a plain scroll
  // both zoom, matching common web map/canvas conventions). Native platforms
  // have no wheel device and never fire this.
  const handleWheel = (e: { deltaY: number; clientX: number; clientY: number; currentTarget: unknown }) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    zoomAbout(scale.value * (1 - e.deltaY * WHEEL_ZOOM_SPEED), e.clientX - rect.left, e.clientY - rect.top);
  };

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      const next = scale.value >= MAX_SCALE ? MIN_SCALE : scale.value * DOUBLE_TAP_ZOOM_STEP;
      zoomAbout(next, e.x, e.y);
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture);

  const canvasAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  // Edge/pill outlines are drawn in canvas units, so zooming would thicken
  // them (and thin them when zoomed out) — dividing by scale keeps their
  // on-screen weight constant.
  const edgeAnimatedProps = useAnimatedProps(() => ({ strokeWidth: 1.25 / scale.value }));
  const pillAnimatedProps = useAnimatedProps(() => ({
    strokeWidth: 1 / scale.value,
    opacity:
      scale.value <= LABEL_FADE_OUT_SCALE
        ? 0
        : scale.value >= LABEL_FADE_IN_SCALE
          ? 1
          : (scale.value - LABEL_FADE_OUT_SCALE) / (LABEL_FADE_IN_SCALE - LABEL_FADE_OUT_SCALE),
  }));
  const labelAnimatedProps = useAnimatedProps(() => ({
    opacity:
      scale.value <= LABEL_FADE_OUT_SCALE
        ? 0
        : scale.value >= LABEL_FADE_IN_SCALE
          ? 1
          : (scale.value - LABEL_FADE_OUT_SCALE) / (LABEL_FADE_IN_SCALE - LABEL_FADE_OUT_SCALE),
  }));

  const titleScreen = <Stack.Screen options={{ title: exploringTitle(data?.nodes.find((n) => n.id === data.centerId)?.label) }} />;

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.cover} />
      </View>
    );
  }

  if (!data || !visible || !layout || !center) {
    return <ErrorState error={error} message={error instanceof Error ? error.message : `No graph found for ${type}/${id}`} />;
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
      router.push(nodeHref(node.id)!);
      return;
    }

    // Likewise has no graph of its own — it's a signpost pointing at the
    // Editions section on its own work's page (see buildWorkGraph), not a
    // real browsable node, so tapping it jumps straight there instead of
    // recentering.
    if (next.type === "editions") {
      router.push(nodeHref(node.id)!);
      return;
    }

    if (node.id !== data.centerId) {
      setHistory((h) => [...h, center]);
      setCenter(next);
      return;
    }
    router.push(nodeHref(node.id)!);
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
  if (layout.nodes.length <= 1 && !isFiltered(filter)) {
    const centerLabel = layout.nodes[0]?.label ?? "this";
    return (
      <View style={styles.center}>
        {titleScreen}
        <OfflineBanner show={isError} updatedAt={dataUpdatedAt} />
        <Text style={styles.emptyGraphText}>No linked connections found for {centerLabel} yet.</Text>
      </View>
    );
  }

  const legend = legendEntries(data.nodes);
  const orderedNodes = [...layout.nodes].sort((a, b) =>
    a.id === data.centerId ? -1 : b.id === data.centerId ? 1 : 0
  );

  return (
    <View style={styles.container}>
      {titleScreen}
      <OfflineBanner show={isError} updatedAt={dataUpdatedAt} />
      <Text style={styles.hint}>
        Each circle is a book, author or subject. Tap one to move there; tap the center circle to open its page.
      </Text>
      <View style={styles.legend}>
        {legend.types.map((nodeType) => (
          <View key={nodeType} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: NODE_COLORS[nodeType] }]} />
            <Text style={styles.legendLabel}>{NODE_LABELS[nodeType]}</Text>
          </View>
        ))}
        {legend.showUnlinked && (
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, styles.legendSwatchFaded]} />
            <Text style={styles.legendLabel}>Not yet linked</Text>
          </View>
        )}
      </View>
      <View style={styles.toolbar}>
        <Button variant="pill" onPress={() => setFilterOpen(true)} active={isFiltered(filter)} accessibilityLabel="Filter graph" tooltip="Choose what the graph shows">
          Filter
        </Button>
        <Button
          variant="pill"
          onPress={() => {
            setListChosen(true);
            setShowList((v) => !v);
          }}
          accessibilityLabel={showList ? "Show graph" : "Show nodes as a list"}
          tooltip={showList ? "Show as a graph" : "Show as a list"}
        >
          {showList ? "Graph" : "List"}
        </Button>
        <ShareButton
          title={`${NODE_LABELS[center.type]} graph`}
          href={routes.graph(center.type, center.id, filterToParams(filter))}
        />
      </View>
      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setFilterOpen(false)} accessibilityLabel="Close filter">
          {/* The empty onPress keeps presses inside the popup from reaching the backdrop. */}
          <Pressable style={styles.sheet} onPress={() => {}} accessible={false}>
          <ScrollView accessibilityViewIsModal>
            <Text accessibilityRole="header" style={styles.sheetTitle}>Filter graph</Text>
            <Text style={styles.sheetHeading}>Node types</Text>
            {[...new Set([...(data.nodes.map((n) => n.type) as string[]), ...filter.hiddenTypes])].map((t) => (
              <FilterRow
                key={t}
                label={NODE_LABELS[t as GraphNode["type"]] ?? t}
                checked={!filter.hiddenTypes.includes(t)}
                onPress={() => updateFilter({ ...filter, hiddenTypes: toggle(filter.hiddenTypes, t) })}
              />
            ))}
            <Text style={styles.sheetHeading}>Connections</Text>
            {[...new Set([...data.edges.map((e) => e.relation), ...filter.hiddenRelations])].map((r) => (
              <FilterRow
                key={r}
                label={relationLabel(r)}
                checked={!filter.hiddenRelations.includes(r)}
                onPress={() => updateFilter({ ...filter, hiddenRelations: toggle(filter.hiddenRelations, r) })}
              />
            ))}
            <Button variant="pill" onPress={() => setFilterOpen(false)} style={{ marginVertical: 16 }}>
              Done
            </Button>
          </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      {history.length > 0 && (
        <Pressable
          ref={titleRef("Back to the previous graph")}
          onPress={handleBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back to previous graph"
        >
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <ChevronLeft size={16} color={theme.colors.cover} strokeWidth={2} />
          </View>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
      )}
      {showList ? (
        <ScrollView style={styles.list}>
          {orderedNodes.length > 1 ? (
            <Text accessibilityRole="header" style={styles.listHeading}>
              {`${orderedNodes.length - 1} connected to ${orderedNodes[0].label}. Tap an item to open its page.`}
            </Text>
          ) : (
            <Text style={styles.listRelations}>Nothing left after filtering. Change the filter to see connections.</Text>
          )}
          {orderedNodes.length > 1 && orderedNodes.map((node) => {
            const isCenter = node.id === data.centerId;
            const relations = isCenter ? "" : nodeRelations(visible, node.id).join(". ");
            const href = node.navigable ? nodeHref(node.id) : null;
            return (
              <View key={node.id} style={styles.listRow}>
                <Pressable
                  ref={titleRef(href ? (isCenter ? `Open ${node.label}` : `View ${node.label}`) : `${node.label} has no page yet`)}
                  onPress={() => href && router.push(href)}
                  disabled={!href}
                  accessibilityRole="button"
                  accessibilityLabel={[`${node.label}, ${NODE_LABELS[node.type]}`, isCenter && "currently centered", !node.navigable && "not yet linked", relations]
                    .filter(Boolean)
                    .join(". ")}
                  accessibilityHint={href ? "Opens this item's page" : undefined}
                  accessibilityState={{ disabled: !href, selected: isCenter }}
                  style={({ pressed }) => [styles.listRowMain, pressed && styles.pressed]}
                >
                  <View style={[styles.legendSwatch, { backgroundColor: NODE_COLORS[node.type] }, !node.navigable && styles.legendSwatchFaded]} />
                  <View style={styles.listBody}>
                    <Text style={styles.listNodeLabel}>{node.label}</Text>
                    {!!relations && <Text style={styles.listRelations}>{relations}</Text>}
                    {!!href && <Text style={styles.listRelations}>{`Open ${NODE_LABELS[node.type].toLowerCase()} page`}</Text>}
                  </View>
                  <Text style={styles.legendLabel}>{NODE_LABELS[node.type]}</Text>
                  {!!href && <ChevronRight size={16} color={theme.colors.inkFaint} strokeWidth={2} />}
                </Pressable>
                {!!href && !isCenter && node.type !== "genre" && node.type !== "editions" && (
                  <Pressable
                    ref={titleRef(`Center graph on ${node.label}`)}
                    onPress={() => handleNodePress(node)}
                    accessibilityRole="button"
                    accessibilityLabel={`Center graph on ${node.label}`}
                    hitSlop={4}
                    style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}
                  >
                    <Crosshair size={20} color={theme.colors.cover} strokeWidth={2} />
                  </Pressable>
                )}
              </View>
            );
          })}
        </ScrollView>
      ) : (
      <GestureDetector gesture={composedGesture}>
        <View
          style={[styles.viewport, { width }]}
          accessibilityHint="Swipe to move between nodes. Activate the highlighted center node for full details. For a list of every connection, use the List button."
          onLayout={(e) => {
            const h = Math.round(e.nativeEvent.layout.height);
            if (h > 0 && h !== measuredHeight) setMeasuredHeight(h);
          }}
          {...(Platform.OS === "web" ? { onWheel: handleWheel } : null)}
        >
          <Animated.View
            style={[
              styles.graphArea,
              { width: layout.contentWidth, height: layout.contentHeight },
              canvasAnimatedStyle,
            ]}
          >
            <View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Svg width={layout.contentWidth} height={layout.contentHeight}>
            {layout.edges.map((edge, i) => {
              const isSourceCenter = edge.source.id === data.centerId;
              const isTargetCenter = edge.target.id === data.centerId;
              const { x1, y1, x2, y2 } = shortenEdge(
                edge.source,
                edge.target,
                isSourceCenter ? CENTER_NODE_RADIUS : NODE_RADIUS,
                isTargetCenter ? CENTER_NODE_RADIUS : NODE_RADIUS
              );
              return (
                <AnimatedLine
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={theme.colors.thread}
                  animatedProps={edgeAnimatedProps}
                />
              );
            })}
            {layout.edges.map((edge, i) => {
              const { text: label, pillWidth, labelX: midX, labelY: midY } = edge;
              return (
                <Fragment key={i}>
                  <AnimatedRect
                    animatedProps={pillAnimatedProps}
                    x={midX - pillWidth / 2}
                    y={midY - PILL_HEIGHT / 2}
                    width={pillWidth}
                    height={PILL_HEIGHT}
                    rx={PILL_HEIGHT / 2}
                    fill={theme.colors.paper}
                    stroke={theme.colors.thread}
                  />
                  <AnimatedSvgText
                    animatedProps={labelAnimatedProps}
                    x={midX}
                    y={midY + 3}
                    fontSize={12}
                    fontFamily={theme.fonts.body}
                    fill={theme.colors.inkFaint}
                    textAnchor="middle"
                  >
                    {label}
                  </AnimatedSvgText>
                </Fragment>
              );
            })}
            {layout.nodes.map((node) => {
              const isCenter = node.id === data.centerId;
              const radius = isCenter ? CENTER_NODE_RADIUS : NODE_RADIUS;
              const lines = wrapLabel(node.label);
              const firstLineY = node.y + radius + 14;
              const opacity = node.navigable ? 1 : 0.4;
              return (
                <Fragment key={node.id}>
                  {/* A soft, slightly-larger dark circle offset downward
                      stands in for a drop shadow — react-native-svg's cross-
                      platform blur support is unreliable, so this fakes the
                      same "resting on the page" depth without it. */}
                  <Circle cx={node.x} cy={node.y + 3} r={radius + 1} fill="#000" opacity={opacity * 0.25} />
                  {isCenter && (
                    <Circle
                      cx={node.x}
                      cy={node.y}
                      r={radius + 5}
                      fill="none"
                      stroke={NODE_COLORS[node.type]}
                      strokeWidth={1}
                      opacity={opacity * 0.3}
                    />
                  )}
                  <Circle
                    cx={node.x}
                    cy={node.y}
                    r={radius}
                    fill={NODE_COLORS[node.type]}
                    opacity={opacity}
                    stroke={theme.colors.paper}
                    strokeWidth={isCenter ? 2.5 : 1.5}
                  />
                  {lines.map((line, i) => (
                    <Fragment key={i}>
                      {/* Paper-colored outline under the text so a line passing behind a label doesn't strike through it. */}
                      <SvgText
                        x={node.x}
                        y={firstLineY + i * LABEL_LINE_HEIGHT}
                        fontSize={13}
                        fontFamily={theme.fonts.bodyMedium}
                        fill={theme.colors.paper}
                        stroke={theme.colors.paper}
                        strokeWidth={3}
                        strokeLinejoin="round"
                        textAnchor="middle"
                      >
                        {line}
                      </SvgText>
                      <SvgText
                        x={node.x}
                        y={firstLineY + i * LABEL_LINE_HEIGHT}
                        fontSize={13}
                        fontFamily={theme.fonts.bodyMedium}
                        fill={theme.colors.ink}
                        textAnchor="middle"
                      >
                        {line}
                      </SvgText>
                    </Fragment>
                  ))}
                </Fragment>
              );
            })}
          </Svg>
        </View>

        {orderedNodes.map((node) => {
          const isCenter = node.id === data.centerId;
          const radius = isCenter ? CENTER_NODE_RADIUS : NODE_RADIUS;
          // A screen reader landing on one node in isolation can't see its edges, so spell them out.
          const relations = nodeRelations(visible, node.id).join(". ");
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
              ref={titleRef(!node.navigable ? `${node.label} has no page yet` : isCenter ? `Open ${node.label}` : `View ${node.label}`)}
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
                ...(node.navigable && Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null),
              }}
              />
          );
        })}
          </Animated.View>
          <View style={styles.zoomControls}>
            <Pressable
              ref={titleRef("Zoom in")}
              onPress={() => zoomByStep(DOUBLE_TAP_ZOOM_STEP)}
              accessibilityRole="button"
              accessibilityLabel="Zoom in"
              hitSlop={4}
              style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}
            >
              <ZoomIn size={20} color={theme.colors.cover} strokeWidth={2} />
            </Pressable>
            <Pressable
              ref={titleRef("Zoom out")}
              onPress={() => zoomByStep(1 / DOUBLE_TAP_ZOOM_STEP)}
              accessibilityRole="button"
              accessibilityLabel="Zoom out"
              hitSlop={4}
              style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}
            >
              <ZoomOut size={20} color={theme.colors.cover} strokeWidth={2} />
            </Pressable>
            <Pressable
              ref={titleRef("Fit the whole graph")}
              onPress={resetView}
              accessibilityRole="button"
              accessibilityLabel="Reset zoom to fit the whole graph"
              hitSlop={4}
              style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}
            >
              <Maximize size={20} color={theme.colors.cover} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
      </GestureDetector>
      )}
    </View>
  );
}

function FilterRow({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      ref={titleRef(checked ? `Hide ${label}` : `Show ${label}`)}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      style={styles.filterRow}
    >
      <View style={[styles.checkbox, checked && styles.checkboxOn]}>{checked && <Check size={14} color="#fff" strokeWidth={3} />}</View>
      <Text style={styles.listLabel}>{label}</Text>
    </Pressable>
  );
}

function createStyles({ colors, spacing, radii, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: colors.paper },
    emptyGraphText: { fontFamily: fonts.display, fontSize: typeScale.md, color: colors.ink, textAlign: "center", lineHeight: 28 },
    hint: {
      textAlign: "center",
      fontFamily: fonts.body,
      fontSize: typeScale.xs,
      color: colors.inkFaint,
      paddingVertical: 10,
      paddingHorizontal: spacing.lg,
    },
    legend: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: spacing.lg,
      paddingBottom: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    legendSwatch: { width: 12, height: 12, borderRadius: 6 },
    legendSwatchFaded: { backgroundColor: colors.graphSubject, opacity: 0.6, borderWidth: 1, borderColor: colors.inkFaint },
    legendLabel: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint },
    backButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      alignSelf: "center",
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    // overflow: hidden clips the canvas to the visible viewport — now that
    // the canvas is panned/zoomed rather than fitted to the screen, it's
    // routinely larger than this box at 100% scale.
    viewport: { flex: 1, overflow: "hidden" },
    graphArea: { position: "relative", transformOrigin: "top left" },
    zoomControls: { position: "absolute", right: spacing.md, bottom: spacing.md, gap: spacing.sm },
    zoomButton: {
      width: 40,
      height: 40,
      borderRadius: radii.sm,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.paper,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    pressed: { opacity: 0.6 },
    toolbar: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: spacing.sm, paddingBottom: spacing.sm },
    sheetBackdrop: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: {
      width: "100%",
      maxWidth: 360,
      maxHeight: "70%",
      backgroundColor: colors.paper,
      padding: spacing.lg,
      borderRadius: radii.sm,
    },
    sheetTitle: { fontFamily: fonts.display, fontSize: typeScale.md, color: colors.ink, marginBottom: spacing.sm },
    sheetHeading: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, color: colors.inkFaint, marginTop: spacing.md },
    filterRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 44 },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: colors.cover,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxOn: { backgroundColor: colors.cover },
    list: { flex: 1, paddingHorizontal: spacing.lg },
    listRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
    listRowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
    listHeading: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.sm, color: colors.ink, paddingVertical: spacing.md },
    listBody: { flex: 1, paddingVertical: spacing.sm },
    listNodeLabel: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink },
    listRelations: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.textFaint },
    listLabel: { flex: 1, fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink },
    backButtonText: { fontFamily: fonts.bodySemiBold, color: colors.cover, fontSize: 14 },
  });
}
