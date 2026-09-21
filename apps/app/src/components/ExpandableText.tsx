import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";

/**
 * A paragraph clamped to a few lines with a "View more" link — but only
 * when the text actually overflows that clamp. A character-count guess at
 * "is this long enough to be clipped" doesn't hold up: the same character
 * count wraps to a different number of lines depending on the container's
 * width and the reader's font size, so it both hides "View more" on text
 * that *is* clipped and shows a dead "View more" (confirmed live: a ~300
 * character description that fit within 4 lines at this layout's width,
 * leaving the button showing but doing nothing when tapped) on text that
 * isn't. This renders the same text twice — once clamped, once off-screen
 * and unclamped — and compares their rendered heights instead. `onLayout`
 * (unlike `onTextLayout`, which React Native Web never fires at all) works
 * the same way on every platform this app ships to.
 */
export function ExpandableText({
  text,
  numberOfLinesCollapsed = 4,
  textStyle,
  viewMoreStyle,
}: {
  text: string;
  numberOfLinesCollapsed?: number;
  textStyle?: StyleProp<TextStyle>;
  viewMoreStyle?: StyleProp<TextStyle>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [measured, setMeasured] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const collapsedHeight = useRef<number | null>(null);
  const fullHeight = useRef<number | null>(null);

  function finishIfReady() {
    if (collapsedHeight.current != null && fullHeight.current != null) {
      setTruncated(fullHeight.current > collapsedHeight.current + 1);
      setMeasured(true);
    }
  }

  return (
    <View>
      <Text
        style={textStyle}
        numberOfLines={expanded ? undefined : numberOfLinesCollapsed}
        onLayout={(e) => {
          if (measured) return;
          collapsedHeight.current = e.nativeEvent.layout.height;
          finishIfReady();
        }}
      >
        {text}
      </Text>
      {!measured && (
        <Text
          style={[textStyle, styles.hiddenMeasurer]}
          pointerEvents="none"
          onLayout={(e) => {
            if (measured) return;
            fullHeight.current = e.nativeEvent.layout.height;
            finishIfReady();
          }}
        >
          {text}
        </Text>
      )}
      {(expanded || truncated) && (
        <Pressable onPress={() => setExpanded((v) => !v)}>
          <Text style={viewMoreStyle}>{expanded ? "View less" : "View more"}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Rendered fully unclamped, directly behind the real (clamped) text, purely
  // to measure the height its content would need — never meant to be seen.
  hiddenMeasurer: { position: "absolute", top: 0, left: 0, right: 0, opacity: 0, zIndex: -1 },
});
