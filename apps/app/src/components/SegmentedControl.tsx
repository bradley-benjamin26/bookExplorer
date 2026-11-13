import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../theme";
import { titleRef } from "../webTitle";

/** A small group of mutually exclusive choices (e.g. Graph | List). The selected one is filled and announced as selected. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  describe,
}: {
  /** Names the group for assistive tech, e.g. "View connections as". */
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  /** Optional accessible label and hover tip per option. */
  describe?: (option: T) => { label: string; tooltip: string };
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View role="group" accessibilityLabel={label} style={styles.group}>
      {options.map((option) => {
        const selected = option === value;
        const d = describe?.(option);
        return (
          <Pressable
            key={option}
            ref={titleRef(d?.tooltip)}
            onPress={() => onChange(option)}
            accessibilityRole="button"
            accessibilityLabel={d?.label}
            accessibilityState={{ selected }}
            style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [
              styles.option,
              selected && styles.selected,
              pressed && styles.pressed,
              focused && styles.focused,
            ]}
          >
            <Text style={[styles.text, selected && styles.selectedText]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles({ colors, radii, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    group: { flexDirection: "row", padding: 3, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: radii.button, backgroundColor: colors.chipBackground },
    option: { minHeight: 38, paddingHorizontal: 17, borderRadius: radii.xs, alignItems: "center", justifyContent: "center" },
    selected: { backgroundColor: colors.pillActiveBackground },
    text: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, color: colors.ink },
    selectedText: { color: colors.primaryText },
    pressed: { opacity: 0.6 },
    focused: { outlineWidth: 3, outlineOffset: 2, outlineColor: colors.focus, outlineStyle: "solid" },
  });
}
