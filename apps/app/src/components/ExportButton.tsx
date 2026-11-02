import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import type { ExportFormat } from "../exportFormats";
import { useThemedStyles, type Theme } from "../theme";
import { titleRef } from "../webTitle";
import { Button } from "./Button";
import { CenteredModal } from "./CenteredModal";

const CHOICES: { format: ExportFormat; label: string; help: string; a11y: string }[] = [
  { format: "json", label: "JSON backup", help: "Everything: books, authors, notes, lists and libraries", a11y: "Export a JSON backup" },
  { format: "csv", label: "CSV", help: "Books only, for Goodreads or StoryGraph", a11y: "Export books as CSV" },
];

/** One Export pill that asks which format to download. */
export function ExportButton({ onChoose }: { onChoose: (format: ExportFormat) => void }) {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="pill" onPress={() => setOpen(true)} accessibilityLabel="Export your library" tooltip="Export your library">
        Export
      </Button>
      <CenteredModal visible={open} label="Export as" onClose={() => setOpen(false)}>
        <Text style={styles.title} accessibilityRole="header">Export as</Text>
        {CHOICES.map((c) => (
          <Pressable
            key={c.format}
            ref={titleRef(c.a11y)}
            accessibilityRole="button"
            accessibilityLabel={c.a11y}
            style={styles.choice}
            onPress={() => {
              setOpen(false);
              onChoose(c.format);
            }}
          >
            <Text style={styles.choiceLabel}>{c.label}</Text>
            <Text style={styles.help}>{c.help}</Text>
          </Pressable>
        ))}
      </CenteredModal>
    </>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    title: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, padding: spacing.lg },
    choice: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    choiceLabel: { fontFamily: fonts.bodyMedium, fontSize: typeScale.sm, color: colors.ink },
    help: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, lineHeight: 20 },
  });
}
