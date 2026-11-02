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
      <View style={styles.body}>
        <Text style={styles.text}>
          Hello! Thank you for trying out Shelf Thread. This is a librarian's hobby project, and I'm curious to see if people would actually use something like this. Please fill out this feedback form to share your experience!
        </Text>
        <Pressable
          ref={titleRef("Feedback form")}
          accessibilityRole="link"
          accessibilityLabel="Feedback form, opens Google Forms"
          onPress={() => Linking.openURL(FEEDBACK_FORM_URL)}
          style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [
            styles.link,
            pressed && styles.pressed,
            focused && { outlineWidth: 2, outlineColor: theme.colors.cover, outlineStyle: "solid" },
          ]}
        >
          <Text style={styles.linkText}>Share your experience in the feedback form</Text>
        </Pressable>
      </View>
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
      alignItems: "flex-start",
      gap: 8,
      marginBottom: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.paper,
      borderWidth: 1,
      borderColor: colors.border,
      borderLeftWidth: 4,
      borderLeftColor: colors.cover,
      borderRadius: radii.sm,
    },
    body: { flex: 1, gap: 4 },
    text: { color: colors.ink, fontFamily: fonts.body, fontSize: typeScale.xs, lineHeight: 20 },
    link: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", paddingVertical: 4 },
    linkText: { color: colors.cover, fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, lineHeight: 20, textDecorationLine: "underline" },
    pressed: { opacity: 0.6 },
  });
}
