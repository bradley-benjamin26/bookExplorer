import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { spacing, useThemedStyles, type Theme } from "../theme";

const WIKIDATA_LOGO_URL =
  "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/41/Wikidata_Stamp_Rec_Light.svg/960px-Wikidata_Stamp_Rec_Light.svg.png";
const OPEN_LIBRARY_URL = "https://openlibrary.org";

/** Attribution footer shown at the end of scrollable screens, since Wikidata- and Open Library-sourced data appears throughout the app. */
export function Footer() {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.footer}>
      <View style={styles.logoBacking}>
        <Image source={{ uri: WIKIDATA_LOGO_URL }} style={styles.logo} resizeMode="contain" />
      </View>
      <Pressable onPress={() => Linking.openURL(OPEN_LIBRARY_URL)} accessibilityRole="link">
        <Text style={styles.text}>Built using Open Library APIs</Text>
      </Pressable>
    </View>
  );
}

function createStyles({ colors, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    footer: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 8,
      paddingTop: spacing.xl,
      marginTop: "auto",
      alignSelf: "stretch",
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.paper,
    },
    logoBacking: {
      backgroundColor: "#ffffff",
      borderRadius: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginBottom: 4,
    },
    logo: { width: 96, height: 19 },
    text: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.cover, textDecorationLine: "underline" },
  });
}
