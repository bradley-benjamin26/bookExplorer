import { StyleSheet, Text } from "react-native";

const BADGE_LABELS: Record<"openLibrary" | "lcsh" | "wikidata", string> = {
  openLibrary: "OL",
  lcsh: "LC",
  wikidata: "WD",
};

/** Small muted provenance label for a chip sourced from one or more external vocabularies — e.g. "LC" or "OL·LC". Renders nothing for an empty `sources` list. Inherits its color from the parent `Text` it's nested in, dimmed via opacity, so it always has adequate contrast against the chip it's inside. */
export function SourceBadge({ sources }: { sources: ("openLibrary" | "lcsh" | "wikidata")[] }) {
  if (sources.length === 0) return null;
  return <Text style={styles.badge}> {sources.map((s) => BADGE_LABELS[s]).join("·")}</Text>;
}

const styles = StyleSheet.create({
  badge: { fontSize: 10, opacity: 0.7 },
});
