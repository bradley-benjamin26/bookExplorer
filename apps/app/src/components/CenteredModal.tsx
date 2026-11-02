import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useThemedStyles, type Theme } from "../theme";

/** A card centered over a scrim. Without `onClose` it cannot be dismissed (backdrop tap and back button do nothing). */
export function CenteredModal({
  visible,
  label,
  onClose,
  children,
}: {
  visible: boolean;
  label: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose ?? (() => {})}>
      <View style={styles.backdrop} accessibilityViewIsModal>
        {onClose && <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />}
        <View style={styles.card} accessibilityLabel={label}>
          {children}
        </View>
      </View>
    </Modal>
  );
}

function createStyles({ colors, spacing, radii }: Theme) {
  return StyleSheet.create({
    // No theme token for a scrim; a translucent black reads in both schemes.
    backdrop: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)" },
    card: {
      width: "100%",
      maxWidth: 480,
      maxHeight: "85%",
      margin: spacing.lg,
      backgroundColor: colors.paper,
      borderRadius: radii.md,
    },
  });
}
