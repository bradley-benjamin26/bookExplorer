import { X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { FEEDBACK_FORM_URL } from "../feedback";
import { dismissFeedbackBanner, isFeedbackBannerDismissed } from "../storage/feedbackBanner";
import { useTheme, useThemedStyles, type Theme } from "../theme";
import { titleRef } from "../webTitle";

/** One-time request for feedback, shown on Home until dismissed (the form stays linked from the Footer). */
export function FeedbackBanner() {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  // null while the stored flag loads, so someone who already dismissed it never sees a flash of banner.
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    isFeedbackBannerDismissed().then(setDismissed);
  }, []);

  if (dismissed !== false) return null;

  const dismiss = () => {
    setDismissed(true);
    dismissFeedbackBanner().catch(() => {});
  };

  return (
    <View style={styles.banner} accessibilityRole="summary">
      <Text style={styles.text}>Help shape Shelf Thread.</Text>
      <Pressable
        ref={titleRef("Share feedback")}
        accessibilityRole="link"
        accessibilityLabel="Share feedback, opens Google Forms"
        onPress={() => Linking.openURL(FEEDBACK_FORM_URL)}
        style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [
          styles.link,
          pressed && styles.pressed,
          focused && { outlineWidth: 2, outlineColor: theme.colors.cover, outlineStyle: "solid" },
        ]}
      >
        <Text style={styles.linkText}>Share feedback</Text>
      </Pressable>
      <Pressable
        ref={titleRef("Dismiss")}
        accessibilityRole="button"
        accessibilityLabel="Dismiss feedback request"
        hitSlop={12}
        onPress={dismiss}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <X size={20} color={theme.colors.inkFaint} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

function createStyles({ colors, fonts, radii, typeScale }: Theme) {
  return StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 12,
      paddingHorizontal: 12,
      backgroundColor: colors.paper,
      borderLeftWidth: 4,
      borderLeftColor: colors.cover,
      borderRadius: radii.sm,
    },
    text: { flexShrink: 1, color: colors.ink, fontFamily: fonts.body, fontSize: typeScale.xs, lineHeight: 20 },
    link: { minHeight: 44, justifyContent: "center", marginRight: "auto" },
    linkText: { color: colors.cover, fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, lineHeight: 20, textDecorationLine: "underline" },
    pressed: { opacity: 0.6 },
  });
}
