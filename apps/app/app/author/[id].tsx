import { useQuery } from "@tanstack/react-query";
import type { AuthorRelation } from "@book-explorer/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchAuthor } from "../../src/api/client";
import { Button } from "../../src/components/Button";
import { Footer } from "../../src/components/Footer";
import { ErrorState } from "../../src/components/ErrorState";
import { OfflineBanner } from "../../src/components/OfflineBanner";
import { MoreByAuthor } from "../../src/components/WorkListSections";
import { AddToListButton } from "../../src/components/AddToListButton";
import { ShareButton } from "../../src/components/ShareButton";
import { routes } from "../../src/navigation";
import { saveAuthor } from "../../src/storage/savedItems";
import { useTheme, useThemedStyles, type Theme } from "../../src/theme";

const SECTIONS: { relation: AuthorRelation["relation"]; title: string }[] = [
  { relation: "influencedBy", title: "Influenced by" },
  { relation: "influenced", title: "Influenced" },
  { relation: "notableWork", title: "Notable Works" },
  { relation: "movement", title: "Literary Movement" },
];

export default function AuthorDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { data, isLoading, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ["author", id],
    queryFn: () => fetchAuthor(id),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.cover} />
      </View>
    );
  }

  if (!data) {
    return <ErrorState error={error} message={error instanceof Error ? error.message : `No author found for ${id}`} />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <OfflineBanner show={isError} updatedAt={dataUpdatedAt} />
      <Text style={styles.name} accessibilityRole="header">{data.name}</Text>
      {(data.birthDate || data.deathDate) && (
        <Text style={styles.dates}>
          {data.birthDate ?? "?"} – {data.deathDate ?? "present"}
        </Text>
      )}
      <ShareButton title={data.name} href={routes.author(data.openLibraryId)} style={{ marginTop: 8 }} />
      <AddToListButton
        style={{ marginTop: 8 }}
        member={{ type: "author", id: data.openLibraryId, title: data.name }}
        onSave={() => saveAuthor(data.openLibraryId, data.name)}
      />
      {data.bio && <Text style={styles.bio}>{data.bio}</Text>}
      {/* Wikipedia's text is CC BY-SA, which requires attribution on reuse. */}
      {data.bioSource === "wikipedia" && data.bioSourceUrl && (
        <Pressable
          style={({ pressed }) => pressed && styles.pressed}
          onPress={() => Linking.openURL(data.bioSourceUrl!)}
        >
          <Text style={styles.bioSource}>via Wikipedia</Text>
        </Pressable>
      )}
      {data.pseudonyms.length > 0 && (
        <Text style={styles.pseudonyms}>Also published as {data.pseudonyms.join(", ")}</Text>
      )}

      {!data.wikidataId && (
        <Text style={styles.noMatch}>No Wikidata match found — showing Open Library data only.</Text>
      )}

      <Pressable
        style={({ pressed }) => [styles.openLibraryLink, pressed && styles.pressed]}
        onPress={() => Linking.openURL(`https://openlibrary.org/authors/${data.openLibraryId}`)}
      >
        <Text style={styles.openLibraryLinkText}>View on Open Library</Text>
      </Pressable>

      <Button
        variant="primary"
        onPress={() => router.push(routes.graph("author", data.openLibraryId))}
        style={styles.graphButton}
        tooltip="See this author's books, subjects and links as a graph"
      >
        View as Graph
      </Button>
      <Button
        variant="primary"
        onPress={() => router.push(routes.connection(`author:${data.openLibraryId}`, data.name))}
        style={styles.graphButton}
        accessibilityLabel={`Find a connection from ${data.name}`}
        tooltip="Find how this author links to a book"
      >
        Find Connection
      </Button>

      <MoreByAuthor title="Works" works={data.moreByAuthor} />

      {SECTIONS.map(({ relation, title }) => {
        const items = data.relations.filter((r) => r.relation === relation);
        if (items.length === 0) return null;

        return (
          <View key={relation} style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
            {items.map((item) => {
              const navigable = relation === "influencedBy" || relation === "influenced";
              const isNavigable = !!item.openLibraryId && navigable;
              const content = (
                <View style={styles.relationRow}>
                  <Text style={styles.relationLabel}>{item.label}</Text>
                  {isNavigable && <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><ChevronRight size={18} color={theme.colors.inkFaint} strokeWidth={2} /></View>}
                </View>
              );
              return isNavigable ? (
                <Pressable
                  key={item.wikidataId}
                  style={({ pressed }) => pressed && styles.pressed}
                  onPress={() => router.push(item.openLibraryId!.endsWith("W") ? routes.work(item.openLibraryId!) : routes.author(item.openLibraryId!))}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                >
                  {content}
                </Pressable>
              ) : (
                <View key={item.wikidataId}>{content}</View>
              );
            })}
          </View>
        );
      })}
      <Footer />
    </ScrollView>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { padding: spacing.lg, alignItems: "flex-start" },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
    name: { fontFamily: fonts.display, fontSize: typeScale.lg, letterSpacing: -0.3, color: colors.ink },
    dates: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, marginTop: spacing.xs },
    bio: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink, marginTop: spacing.lg, lineHeight: 24 },
    bioSource: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.cover, marginTop: spacing.sm },
    pseudonyms: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint, marginTop: spacing.md, fontStyle: "italic" },
    noMatch: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.warning, marginTop: spacing.lg, fontStyle: "italic" },
    openLibraryLink: { alignSelf: "flex-start", marginTop: spacing.lg },
    openLibraryLinkText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.cover },
    graphButton: { width: "100%", marginTop: spacing.lg },
    pressed: { opacity: 0.6 },
    section: { marginTop: spacing.xxl, width: "100%" },
    sectionTitle: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginBottom: spacing.md },
    relationRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    relationLabel: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink },
  });
}
