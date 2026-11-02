import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme, useThemedStyles, type Theme } from "../theme";
import { titleRef } from "../webTitle";

/** A titled section that starts closed and shows its children when opened. */
export function AccordionSection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  // Down/up, not right: a right chevron means "go to another page" everywhere else in the app.
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <View>
      <Pressable
        ref={titleRef(open ? `Collapse ${title}` : `Expand ${title}`)}
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [
          styles.header,
          pressed && { opacity: 0.6 },
          // RN Web only; same focus ring as Button.
          focused && { outlineWidth: 2, outlineColor: colors.cover, outlineStyle: "solid" as const },
        ]}
      >
        <Text style={styles.title}>{title}</Text>
        <Chevron size={20} color={colors.ink} />
      </Pressable>
      <View style={styles.rule} />
      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

function createStyles({ colors, fonts, typeScale, spacing }: Theme) {
  return StyleSheet.create({
    header: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: spacing.md,
    },
    title: { flex: 1, fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink },
    // The thread, quiet: a section divider is a strand of it.
    rule: { height: 1, backgroundColor: colors.thread, opacity: 0.4 },
    body: { paddingTop: spacing.md },
  });
}
