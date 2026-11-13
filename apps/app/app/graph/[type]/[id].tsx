import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Graph, GraphNode } from "@book-explorer/shared";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Check, ChevronLeft, ChevronRight, Crosshair, Maximize, ZoomIn, ZoomOut } from "lucide-react-native";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Footer } from "../../../src/components/Footer";
import { AccessibilityInfo, ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
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
import { SegmentedControl } from "../../../src/components/SegmentedControl";
import { centeredLabel, legendEntries, NODE_LABELS, nodeRelations, pathAsGraph, relationLabel } from "../../../src/graphLabels";
import { applyGraphFilter, filterFromParams, filterToParams, isFiltered, shouldAutoOpenList, toggle, type GraphFilter } from "../../../src/graphFilters";
import { nodeHref, nodePressHref, routes } from "../../../src/navigation";
import { CONTENT_MAX_WIDTH, useTheme, useThemedStyles, type Theme, type ThemeColors } from "../../../src/theme";
import { TOOLBAR_CONTROL_HEIGHT } from "../../../src/toolbarMetrics";
import { subjectSpokenLabel } from "../../../src/subjectLabel";
import { shouldSuppressPress, useGraphMotion } from "../../../src/useGraphMotion";
import { CENTER_NODE_RADIUS, CONTROLS_GUTTER, clampOffset, fitScale, hitNode, LABEL_LINE_HEIGHT, labelOpacity, layoutGraph, MAX_SCALE, MIN_SCALE, NODE_RADIUS, PILL_HEIGHT, shortenEdge, wrapLabel, zoomAt, type Center, type PositionedNode } from "../../../src/graphLayout";

/** Node labels show subjects with "->"; screen readers get commas. */
const spoken = (n: GraphNode) => (n.type === "subject" ? subjectSpokenLabel(n.label.split("->").join(", ")) : n.label);

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
    award: colors.graphAward,
  };
}


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
  // (e.g. the "View as graph" button elsewhere) is a real navigation.
  const [center, setCenter] = useState<Center | null>(type && id ? { type: type as GraphNode["type"], id } : null);
  const [history, setHistory] = useState<Center[]>([]);

  // Opened from Find connection: the starting view is just the path, read from
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
  // Live positions for drawing; only `bounds` and the content size stay static (centerNode is one of the mutated layout.nodes, so it is live).
  const motion = useGraphMotion(layout, data?.centerId);
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
  // to show the whole graph clear of the zoom controls — never past MIN_SCALE,
  // never magnified — centered, instead of cropping outer nodes.
  function resetView() {
    if (!layout) return;
    const { bounds } = layout;
    const initial = fitScale({ width, height: canvasHeight }, bounds, CONTROLS_GUTTER);
    scale.value = initial;
    // Centred on the nodes themselves, which needn't sit in the middle of the content box.
    translateX.value = (width - bounds.width * initial) / 2 - bounds.x * initial;
    translateY.value = (canvasHeight - bounds.height * initial) / 2 - bounds.y * initial;
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
    translateX.value = clampOffset(translateX.value, viewportWidth.value, contentWidth.value, s);
    translateY.value = clampOffset(translateY.value, viewportHeight.value, contentHeight.value, s);
  }

  // Zooms to `next` while keeping the canvas point under (focalX, focalY)
  // fixed on screen, so zooming goes toward the fingers/cursor instead of
  // drifting toward the canvas's own center.
  function zoomAbout(next: number, focalX: number, focalY: number) {
    "worklet";
    const z = zoomAt({ scale: scale.value, x: translateX.value, y: translateY.value }, next, focalX, focalY);
    translateX.value = z.x;
    translateY.value = z.y;
    scale.value = z.scale;
    clampTranslation(z.scale);
  }

  const pinchStartScale = useSharedValue(1);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);
  // The node a pan began on (-1: the pan moves the canvas instead), and whether that drag got past minDistance.
  const dragIndex = useSharedValue(-1);
  const dragStarted = useSharedValue(false);
  const { points, dragStart, dragMove, dragEnd } = motion;

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
    .onBegin((e) => {
      // Inverse of canvasAnimatedStyle (translate, then scale about the top-left).
      dragIndex.value = hitNode(points.value, (e.x - translateX.value) / scale.value, (e.y - translateY.value) / scale.value);
    })
    .onStart((e) => {
      // A two-finger gesture is a pinch, not a node drag.
      if (e.numberOfPointers > 1) dragIndex.value = -1;
      if (dragIndex.value >= 0) {
        dragStarted.value = true;
        runOnJS(dragStart)(dragIndex.value);
        return;
      }
      panStartX.value = translateX.value;
      panStartY.value = translateY.value;
    })
    .onUpdate((e) => {
      if (dragIndex.value >= 0 && e.numberOfPointers > 1) {
        // A second finger landed mid-drag: end the drag and pan the canvas from here, without a jump.
        if (dragStarted.value) runOnJS(dragEnd)(dragIndex.value);
        dragIndex.value = -1;
        dragStarted.value = false;
        panStartX.value = translateX.value - e.translationX;
        panStartY.value = translateY.value - e.translationY;
      }
      if (dragIndex.value >= 0) {
        runOnJS(dragMove)(dragIndex.value, (e.x - translateX.value) / scale.value, (e.y - translateY.value) / scale.value);
        return;
      }
      translateX.value = panStartX.value + e.translationX;
      translateY.value = panStartY.value + e.translationY;
      clampTranslation(scale.value);
    })
    .onFinalize(() => {
      if (dragIndex.value >= 0 && dragStarted.value) runOnJS(dragEnd)(dragIndex.value);
      dragIndex.value = -1;
      dragStarted.value = false;
    });

  // Trackpad/mouse equivalent for pinch, since Gesture.Pinch() only fires
  // from an actual two-finger touch gesture and react-native-gesture-handler's
  // web Pan handler doesn't surface plain mouse-wheel deltas at all — so this
  // reads the native wheel event directly (ctrl/cmd+scroll zooms; a plain
  // scroll is left to the page). Native platforms have no wheel device and
  // never fire this.
  const handleWheel = (e: { deltaY: number; clientX: number; clientY: number; currentTarget: unknown; ctrlKey: boolean; metaKey: boolean }) => {
    // A plain scroll belongs to the page; trackpad pinch arrives as ctrl+wheel.
    if (!e.ctrlKey && !e.metaKey) return;
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
    opacity: labelOpacity(scale.value),
  }));
  const labelAnimatedProps = useAnimatedProps(() => ({
    opacity: labelOpacity(scale.value),
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
    // A drag released over its own node fires a press on web.
    if (shouldSuppressPress(motion.lastDragEnd(), Date.now())) return;
    if (!node.navigable) return;
    // Genre, editions and award nodes have no graph of their own (a genre is an
    // Open Library subject, editions a signpost to its work page) and the center
    // opens its page, so those jump straight there; any other node recenters.
    const href = nodePressHref(node.id, data.centerId);
    if (href) {
      router.push(href);
      return;
    }
    setHistory((h) => [...h, center]);
    setCenter(parseNodeId(node.id));
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
  const centerLabel = data.nodes.find((n) => n.id === data.centerId)?.label;
  const orderedNodes = [...motion.nodes].sort((a, b) =>
    a.id === data.centerId ? -1 : b.id === data.centerId ? 1 : 0
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.pageContent}>
      {titleScreen}
      <OfflineBanner show={isError} updatedAt={dataUpdatedAt} />
      <View style={styles.titleBlock}>
        <Text style={styles.eyebrow}>Follow the thread</Text>
        <Text style={styles.heading} accessibilityRole="header">
          {exploringTitle(centerLabel)}
        </Text>
      </View>
      <Text style={styles.hint}>
        Each circle is a book, author or subject. Choose one to follow it, drag it to rearrange, or choose the centre circle to open its page.
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
        <SegmentedControl
          label="View connections as"
          options={["Graph", "List"] as const}
          value={showList ? "List" : "Graph"}
          onChange={(mode) => {
            setListChosen(true);
            setShowList(mode === "List");
          }}
          describe={(mode) => (mode === "List" ? { label: "Show nodes as a list", tooltip: "Show as a list" } : { label: "Show graph", tooltip: "Show as a graph" })}
        />
        <View style={styles.toolbarActions}>
        <Button variant="pill" style={{ minHeight: TOOLBAR_CONTROL_HEIGHT, justifyContent: "center" }} onPress={() => setFilterOpen(true)} active={isFiltered(filter)} accessibilityLabel="Filter graph" tooltip="Choose what the graph shows">
          Filter
        </Button>
        <ShareButton
          title={`${NODE_LABELS[center.type]} graph`}
          href={routes.graph(center.type, center.id, filterToParams(filter))}
          style={{ minHeight: TOOLBAR_CONTROL_HEIGHT, justifyContent: "center" }}
          align="right"
        />
        </View>
      </View>
      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <View style={styles.sheetBackdrop}>
          {/* A sibling behind the popup, so the popup's controls are not nested inside a button. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setFilterOpen(false)} accessibilityLabel="Close filter" />
          <View style={styles.sheet}>
            <ScrollView style={{ flexShrink: 1 }} accessibilityViewIsModal>
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
          </View>
        </View>
      </Modal>
      {history.length > 0 && (
        <Pressable
          ref={titleRef("Back to the previous graph")}
          onPress={handleBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Previous thread"
        >
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <ChevronLeft size={16} color={theme.colors.cover} strokeWidth={2} />
          </View>
          <Text style={styles.backButtonText}>Previous thread</Text>
        </Pressable>
      )}
      <Text style={styles.centered} accessibilityLiveRegion="polite">
        {centeredLabel(centerLabel)}
      </Text>
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
                  ref={titleRef(href ? (isCenter ? `Open ${spoken(node)}` : `View ${spoken(node)}`) : `${spoken(node)} has no page yet`)}
                  onPress={() => href && router.push(href)}
                  disabled={!href}
                  accessibilityRole="button"
                  accessibilityLabel={[`${spoken(node)}, ${NODE_LABELS[node.type]}`, isCenter && "currently centered, you are here", !node.navigable && "not yet linked", relations]
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
                    ref={titleRef(`Center graph on ${spoken(node)}`)}
                    onPress={() => handleNodePress(node)}
                    accessibilityRole="button"
                    accessibilityLabel={`Center graph on ${spoken(node)}`}
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
            {motion.edges.map((edge, i) => {
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
            {motion.edges.map((edge, i) => {
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
            {motion.nodes.map((node) => {
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
                      stroke={theme.colors.primary}
                      strokeWidth={2}
                      opacity={opacity}
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
                  {isCenter && (
                    <>
                      <SvgText
                        x={node.x}
                        y={firstLineY + lines.length * LABEL_LINE_HEIGHT}
                        fontSize={12}
                        fontFamily={theme.fonts.bodySemiBold}
                        fill={theme.colors.paper}
                        stroke={theme.colors.paper}
                        strokeWidth={3}
                        strokeLinejoin="round"
                        textAnchor="middle"
                      >
                        You are here
                      </SvgText>
                      <SvgText
                        x={node.x}
                        y={firstLineY + lines.length * LABEL_LINE_HEIGHT}
                        fontSize={12}
                        fontFamily={theme.fonts.bodySemiBold}
                        fill={theme.colors.cover}
                        textAnchor="middle"
                      >
                        You are here
                      </SvgText>
                    </>
                  )}
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
            `${spoken(node)}, ${NODE_LABELS[node.type]}`,
            isCenter && "currently centered",
            relations,
            !node.navigable && "not yet linked",
          ]
            .filter(Boolean)
            .join(". ");

          return (
            <Pressable
              key={node.id}
              ref={titleRef(!node.navigable ? `${spoken(node)} has no page yet` : isCenter ? `Open ${spoken(node)}` : `View ${spoken(node)}`)}
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
      <Footer />
    </ScrollView>
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
    // The graph/list fill what's left of the screen but never shrink below MIN_CANVAS_HEIGHT, so short windows scroll to the footer.
    pageContent: { flexGrow: 1 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: colors.paper },
    emptyGraphText: { fontFamily: fonts.display, fontSize: typeScale.md, color: colors.ink, textAlign: "center", lineHeight: 28 },
    titleBlock: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
    eyebrow: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, color: colors.cover, letterSpacing: 1.5, textTransform: "uppercase" },
    heading: { fontFamily: fonts.displayMedium, fontSize: typeScale.lg, lineHeight: 32, color: colors.ink, marginTop: 2 },
    centered: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, textAlign: "center", paddingBottom: spacing.sm },
    hint: {
      fontFamily: fonts.body,
      fontSize: typeScale.xs,
      color: colors.inkFaint,
      paddingVertical: 10,
      paddingHorizontal: spacing.lg,
    },
    legend: {
      flexDirection: "row",
      flexWrap: "wrap",
      columnGap: spacing.md,
      rowGap: spacing.xs,
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
    viewport: { flex: 1, minHeight: 360, overflow: "hidden", backgroundColor: colors.card, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.cardBorder },
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
    toolbar: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: spacing.sm, paddingBottom: spacing.sm },
    toolbarActions: { flexDirection: "row", gap: spacing.sm, marginLeft: "auto" },
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
      borderRadius: radii.xs,
      borderWidth: 2,
      borderColor: colors.cover,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxOn: { backgroundColor: colors.cover },
    list: { flex: 1, minHeight: 360, paddingHorizontal: spacing.lg },
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
