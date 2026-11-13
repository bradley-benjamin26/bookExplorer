import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { pickThread, type HomeThread as Thread } from "../homeThreads";
import { routes } from "../navigation";
import { threadGeometry } from "../threadGeometry";
import { revealAt } from "../threadReveal";
import { useThemedStyles, type Theme } from "../theme";
import { titleRef } from "../webTitle";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const HEIGHT = 96;
const NODE = 14;
const TAP = 44;
const DRAW_MS = 1600;

/** A real author → book → subject thread picked at random each time Home is shown. The line draws itself in as a
 * curved, looped thread and each stop appears as it reaches it; every stop opens its real page. */
export function HomeThread() {
  const router = useRouter();
  const [thread, setThread] = useState(() => pickThread());
  // Returning to Home shows a different thread; the first focus keeps the one already picked.
  const seen = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (seen.current) setThread((t) => pickThread(Math.random, t.id));
      seen.current = true;
    }, [])
  );
  // Keyed by thread so a new pick draws in again.
  return <ThreadBody key={thread.id} thread={thread} onOpen={(href) => router.push(href)} />;
}

type Stop = { kind: "author" | "work" | "subject"; label: string; title: string; action: string; a11y: string; href: ReturnType<typeof routes.author> };

function stopsOf(t: Thread): Stop[] {
  return [
    { kind: "author", label: "An author", title: t.author.name, action: "Meet author →", a11y: `${t.author.name}, author. Meet author`, href: routes.author(t.author.id) },
    { kind: "work", label: "One of their books", title: t.work.title, action: "Explore book →", a11y: `${t.work.title}, book. Explore book`, href: routes.work(t.work.id) },
    { kind: "subject", label: "A subject they write about", title: t.subject.label, action: "Explore subject →", a11y: `${t.subject.label}, subject. Explore subject`, href: routes.subject(t.subject.slug, t.subject.label) },
  ];
}

function ThreadBody({ thread, onOpen }: { thread: Thread; onOpen: (href: Stop["href"]) => void }) {
  const styles = useThemedStyles(createStyles);
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (!reduceMotion) progress.value = withTiming(1, { duration: DRAW_MS, easing: Easing.inOut(Easing.cubic) });
  }, []);
  const stops = stopsOf(thread);
  const geo = width > 0 ? threadGeometry(width, HEIGHT, stops.length, width / (stops.length * 2)) : null;
  const length = geo?.length ?? 1;
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - progress.value) }));

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {geo && (
        <View style={{ height: HEIGHT }}>
          {/* The thread and its nodes are decoration; the three text links below carry the meaning. */}
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
            <Svg width={width} height={HEIGHT}>
              <AnimatedPath
                d={geo.d}
                fill="none"
                stroke={styles.line.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={[length, length]}
                animatedProps={lineProps}
              />
            </Svg>
            {geo.points.map((p, i) => (
              <Node key={stops[i].kind} x={p.x} y={p.y} at={p.at} progress={progress} kind={stops[i].kind} onPress={() => onOpen(stops[i].href)} />
            ))}
          </View>
        </View>
      )}
      <View style={styles.columns}>
        {stops.map((s) => (
          <Pressable
            key={s.kind}
            ref={titleRef(s.action.replace(" →", ""))}
            onPress={() => onOpen(s.href)}
            accessibilityRole="link"
            accessibilityLabel={s.a11y}
            style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [styles.column, pressed && styles.pressed, focused && styles.focused]}
          >
            <Text style={styles.kind}>{s.label}</Text>
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.action}>{s.action}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        ref={titleRef("See this book's connections as a graph")}
        onPress={() => onOpen(routes.graph("work", thread.work.id))}
        accessibilityRole="link"
        style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [styles.graphLink, pressed && styles.pressed, focused && styles.focused]}
      >
        <Text style={styles.action}>Explore this thread as a graph →</Text>
      </Pressable>
    </View>
  );
}

function Node({ x, y, at, progress, kind, onPress }: { x: number; y: number; at: number; progress: ReturnType<typeof useSharedValue<number>>; kind: Stop["kind"]; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  const reveal = useAnimatedStyle(() => {
    const v = revealAt(progress.value, at);
    return { opacity: v, transform: [{ scale: 0.6 + 0.4 * v }] };
  });
  return (
    // A bigger tap target around the dot; the text links below are the accessible route, so this one is skipped by tab and screen readers.
    <Pressable focusable={false} onPress={onPress} style={[styles.tap, { left: x - TAP / 2, top: y - TAP / 2 }]}>
      <Animated.View style={[styles.node, styles[kind], reveal]} />
    </Pressable>
  );
}

function createStyles({ colors, fonts, typeScale, spacing }: Theme) {
  return StyleSheet.create({
    line: { color: colors.thread },
    columns: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
    column: { flex: 1, alignItems: "center", paddingVertical: spacing.sm, paddingHorizontal: 2, gap: 2 },
    kind: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, textAlign: "center" },
    title: { fontFamily: fonts.display, fontSize: typeScale.sm, color: colors.ink, textAlign: "center" },
    action: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, color: colors.cover, textAlign: "center" },
    graphLink: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", marginTop: spacing.sm },
    pressed: { opacity: 0.6 },
    focused: { outlineWidth: 3, outlineOffset: 2, outlineColor: colors.focus, outlineStyle: "solid" },
    tap: { position: "absolute", width: TAP, height: TAP, alignItems: "center", justifyContent: "center" },
    // The ring in the paper colour lifts the dot off the line it sits on.
    node: { width: NODE, height: NODE, borderRadius: NODE / 2, borderWidth: 3, borderColor: colors.paper },
    author: { backgroundColor: colors.graphAuthor },
    work: { backgroundColor: colors.graphWork },
    subject: { backgroundColor: colors.graphSubject },
  });
}
