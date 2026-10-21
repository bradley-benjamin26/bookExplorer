import { StyleSheet, Text } from "react-native";
import { useThemedStyles, type Theme } from "../theme";

const BADGE_LABELS: Record<"openLibrary" | "lcsh" | "wikidata", string> = {
  openLibrary: "OL",
  lcsh: "LC",
  wikidata: "WD",
};

/** Small muted provenance label for a chip sourced from one or more external vocabularies — e.g. "LC" or "OL·LC". Renders nothing for an empty `sources` list. */
export function SourceBadge({ sources }: { sources: ("openLibrary" | "lcsh" | "wikidata")[] }) {
  const styles = useThemedStyles(createStyles);
  if (sources.length === 0) return null;
  return <Text style={styles.badge}> {sources.map((s) => BADGE_LABELS[s]).join("·")}</Text>;
}

function createStyles({ colors }: Theme) {
  return StyleSheet.create({
    badge: { fontSize: 10, color: colors.textFaint },
  });
}
