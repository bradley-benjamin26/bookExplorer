import { ScrollView, StyleSheet } from "react-native";
import { BackupSection } from "../src/components/BackupSection";
import { Footer } from "../src/components/Footer";
import { useThemedStyles, type Theme } from "../src/theme";

export default function Backup() {
  const styles = useThemedStyles(createStyles);
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackupSection onImported={() => {}} />
      <Footer />
    </ScrollView>
  );
}

function createStyles({ colors, spacing }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { padding: spacing.lg },
  });
}
