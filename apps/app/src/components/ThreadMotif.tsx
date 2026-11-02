import { StyleSheet, Text, View } from "react-native";
import { useTheme, useThemedStyles, type Theme } from "../theme";

const NODES = [
  ["Book", "graphWork"],
  ["Author", "graphAuthor"],
  ["Subject", "graphSubject"],
  ["Genre", "graphGenre"],
] as const;

/** The graph's four node colors joined by the thread: Home's intro (labelled) and the empty states. Decorative. */
export function ThreadMotif({ labelled }: { labelled: boolean }) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.thread}>
      <View style={styles.line} />
      {NODES.map(([label, color]) => (
        <View key={label} style={styles.stop}>
          <View style={[styles.node, { backgroundColor: theme.colors[color] }]} />
          {labelled && <Text style={styles.label}>{label}</Text>}
        </View>
      ))}
    </View>
  );
}

function createStyles({ colors, fonts, typeScale, spacing }: Theme) {
  return StyleSheet.create({
    thread: { flexDirection: "row" },
    // Runs between the first and last node centres: four equal cells put those at 1/8 and 7/8.
    line: { position: "absolute", top: 6, left: "12.5%", right: "12.5%", height: 1, backgroundColor: colors.thread },
    stop: { flex: 1, alignItems: "center", gap: spacing.xs },
    node: { width: 12, height: 12, borderRadius: 6 },
    label: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint },
  });
}
