import { BookOpen } from "lucide-react-native";
import { View } from "react-native";
import { useTheme } from "../theme";

/** Stands in for a missing cover: an outlined box with a book icon, so it reads as "no cover" rather than a blank gap. */
export function CoverPlaceholder({ width, height }: { width: number; height: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width,
        height,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: colors.pillBorder,
        backgroundColor: colors.chipBackground,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <BookOpen size={18} color={colors.inkFaint} strokeWidth={2} />
    </View>
  );
}
