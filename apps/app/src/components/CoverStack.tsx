import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { useThemedStyles, type Theme } from "../theme";
import { CoverPlaceholder } from "./CoverPlaceholder";

const WIDTH = 28;
const HEIGHT = 42;
const STEP = WIDTH - 10; // each cover overlaps the previous by 10px

/** Up to three overlapping small covers for a list row; a `null` entry, or no entries, shows a placeholder.
 * Hidden from assistive tech: the row's label carries the meaning. */
export function CoverStack({ urls }: { urls: (string | null)[] }) {
  const styles = useThemedStyles(createStyles);
  const items = urls.length ? urls : [null];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: WIDTH + STEP * (items.length - 1), height: HEIGHT }}
    >
      {items.map((url, i) => (
        <View key={i} style={[styles.cover, { left: i * STEP, zIndex: items.length - i }]}>
          <View style={styles.clip}>
            {url ? <Image source={{ uri: url }} contentFit="cover" style={styles.image} /> : <CoverPlaceholder width={WIDTH} height={HEIGHT} />}
          </View>
        </View>
      ))}
    </View>
  );
}

function createStyles({ colors, radii, cardStyle }: Theme) {
  return StyleSheet.create({
    // Shadow lives on the outer view (iOS clips it under overflow: hidden); a card-coloured border separates overlapping covers.
    cover: {
      position: "absolute",
      width: WIDTH,
      height: HEIGHT,
      borderRadius: radii.xs,
      borderWidth: 1,
      borderColor: colors.card,
      backgroundColor: colors.chipBackground,
      shadowColor: cardStyle.shadowColor,
      shadowOffset: cardStyle.shadowOffset,
      shadowOpacity: cardStyle.shadowOpacity,
      shadowRadius: cardStyle.shadowRadius,
      elevation: cardStyle.elevation,
    },
    clip: { flex: 1, borderRadius: radii.xs, overflow: "hidden" },
    image: { width: "100%", height: "100%" },
  });
}
