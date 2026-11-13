import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text } from "react-native";
import { fetchLibraryAvailability } from "../api/client";
import { availabilityLine } from "../libraryAvailability";
import { useThemedStyles, type Theme } from "../theme";

/** A quiet availability line; renders nothing while loading, on error, or when the book isn't found. */
export function LibraryAvailability({ libraryId, name, isbn }: { libraryId: string; name: string; isbn?: string | null }) {
  const styles = useThemedStyles(createStyles);
  const { data } = useQuery({
    queryKey: ["libraryAvailability", libraryId, isbn],
    queryFn: ({ signal }) => fetchLibraryAvailability(libraryId, isbn as string, signal),
    enabled: !!isbn,
    staleTime: 60_000,
    retry: false,
  });
  const line = data ? availabilityLine(data) : null;
  return line ? <Text style={styles.line}>{`${name}: ${line}`}</Text> : null;
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    line: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, paddingVertical: spacing.xs },
  });
}
