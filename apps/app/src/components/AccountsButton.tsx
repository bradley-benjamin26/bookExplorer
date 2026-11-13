import { UserRound } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { HardcoverAccountPanel } from "../../app/hardcover";
import { OpenLibraryAccountPanel } from "../../app/openlibrary";
import { useThemedStyles, type Theme } from "../theme";
import { Button } from "./Button";
import { CenteredModal } from "./CenteredModal";
import { HeaderIconButton } from "./HeaderIconButton";

/** Header button that opens a popup for connecting the Hardcover and Open Library accounts. */
export function AccountsButton() {
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <HeaderIconButton label="Accounts" Icon={UserRound} onPress={() => setOpen(true)} />
      <CenteredModal visible={open} label="Accounts" onClose={close}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heading} accessibilityRole="header">Hardcover</Text>
          <HardcoverAccountPanel onNavigate={close} />
          <Text style={styles.heading} accessibilityRole="header">Open Library</Text>
          <OpenLibraryAccountPanel onNavigate={close} />
          <Button variant="pill" onPress={close} style={styles.close}>Close</Button>
        </ScrollView>
      </CenteredModal>
    </>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    content: { padding: spacing.lg },
    heading: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginBottom: spacing.sm },
    close: { marginTop: spacing.xl, alignSelf: "flex-start" },
  });
}
