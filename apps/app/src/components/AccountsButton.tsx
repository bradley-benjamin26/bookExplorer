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
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <HeaderIconButton label="Accounts" Icon={UserRound} onPress={() => setOpen(true)} />
      <CenteredModal visible={open} label="Accounts" onClose={close}>
        <AccountsPanels onClose={close} />
      </CenteredModal>
    </>
  );
}

/** The popup's contents; the header menu shows them in its own modal, since iOS can't open a second modal while one closes. */
export function AccountsPanels({ onClose }: { onClose: () => void }) {
  const styles = useThemedStyles(createStyles);
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.heading} accessibilityRole="header">Hardcover</Text>
      <HardcoverAccountPanel onNavigate={onClose} />
      <Text style={styles.heading} accessibilityRole="header">Open Library</Text>
      <OpenLibraryAccountPanel onNavigate={onClose} />
      <Button variant="pill" onPress={onClose} style={styles.close}>Close</Button>
    </ScrollView>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    content: { padding: spacing.lg },
    heading: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginBottom: spacing.sm },
    close: { marginTop: spacing.xl, alignSelf: "flex-start" },
  });
}
