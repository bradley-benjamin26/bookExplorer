import type { Edition, Work } from "@book-explorer/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Image as CachedImage } from "expo-image";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchBookWithAlternate } from "../api/bookLookup";
import { isbnEditions } from "../editionChoice";
import { saveBook } from "../storage/savedBooks";
import { saveWork } from "../storage/savedWorks";
import { useThemedStyles, type Theme } from "../theme";
import { titleRef } from "../webTitle";
import { AddToListButton, type SaveSheetHandle } from "./AddToListButton";
import { Button } from "./Button";

/**
 * "Save to list" on a work: asks which ISBN edition to save and saves that edition as a book.
 * A work with no ISBN edition is saved as a work. `onSaved` gets the saved edition's ISBN, or null for a work.
 */
export function WorkSaveButton({ work, onSaved, ref }: { work: Work; onSaved: (isbn: string | null) => void; ref?: Ref<SaveSheetHandle> }) {
  const styles = useThemedStyles(createStyles);
  const queryClient = useQueryClient();
  const sheet = useRef<SaveSheetHandle>(null);
  const editions = isbnEditions(work.editions);
  const [choosing, setChoosing] = useState(false);
  // A new object per pick, so picking the same edition again reopens the list sheet.
  const [target, setTarget] = useState<{ isbn: string | null } | null>(null);
  const isbn = target?.isbn ?? null;
  // Done also runs with nothing ticked or only unticking, so follow the save only when onSave ran.
  const saved = useRef(false);

  useEffect(() => {
    if (target) sheet.current?.open();
  }, [target]);

  const open = () => {
    saved.current = false;
    if (editions.length > 0) setChoosing(true);
    else sheet.current?.open();
  };
  useImperativeHandle(ref, () => ({ open }));
  const pick = (isbn: string | null) => {
    setChoosing(false);
    saved.current = false;
    setTarget({ isbn });
  };

  return (
    <>
      {editions.length > 0 && (
        <Button variant="pill" starIcon onPress={open} accessibilityLabel="Save to list" tooltip="Save an edition to one of your lists">
          Save to list
        </Button>
      )}
      <AddToListButton
        ref={sheet}
        hidden={editions.length > 0}
        member={isbn ? { type: "book", id: isbn, title: work.title } : { type: "work", id: work.openLibraryWorkId, title: work.title }}
        onSave={async () => {
          let record;
          if (isbn) record = await saveBook(await queryClient.fetchQuery({ queryKey: ["book", isbn], queryFn: () => fetchBookWithAlternate(isbn) }));
          else {
            // Keeps the cover on disk so the saved work still shows it offline.
            if (work.coverUrl) CachedImage.prefetch(work.coverUrl, "disk");
            record = await saveWork(work);
          }
          saved.current = true;
          return record;
        }}
        onChange={() => saved.current && onSaved(isbn)}
      />
      <Modal visible={choosing} transparent animationType="fade" onRequestClose={() => setChoosing(false)}>
        <View style={styles.backdrop}>
          {/* A sibling behind the popup, so the popup's controls are not nested inside a button. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setChoosing(false)} accessibilityLabel="Close" />
          <View style={styles.popup}>
            <ScrollView style={{ flexShrink: 1 }} accessibilityViewIsModal>
              <Text accessibilityRole="header" style={styles.title}>Choose an edition</Text>
              {editions.map((e) => (
                <EditionRow key={e.isbn} edition={e} onPress={() => pick(e.isbn)} />
              ))}
              <Button variant="pill" onPress={() => pick(null)} style={styles.workInstead}>
                Save the work instead
              </Button>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function EditionRow({ edition, onPress }: { edition: Edition; onPress: () => void }) {
  const styles = useThemedStyles(createStyles);
  const label = edition.format ?? "Edition";
  return (
    <Pressable
      ref={titleRef(`Save ${label} ${edition.isbn}`)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${edition.isbn}`}
    >
      {edition.coverUrl ? <Image source={{ uri: edition.coverUrl }} style={styles.cover} resizeMode="contain" /> : <View style={styles.cover} />}
      <View style={styles.rowText}>
        <Text style={styles.format}>{label}</Text>
        {[edition.publisher, edition.publishDate, edition.isbn].filter(Boolean).map((t) => (
          <Text key={t} style={styles.meta} numberOfLines={1}>{t}</Text>
        ))}
      </View>
    </Pressable>
  );
}

function createStyles({ colors, spacing, radii, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    // Same centred popup as the graph filter. No theme token for a scrim; a translucent black reads in both schemes.
    backdrop: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.4)" },
    popup: { width: "100%", maxWidth: 360, maxHeight: "70%", backgroundColor: colors.paper, padding: spacing.lg, borderRadius: radii.sm },
    title: { fontFamily: fonts.display, fontSize: typeScale.md, color: colors.ink, marginBottom: spacing.sm },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
    cover: { width: 40, height: 58, backgroundColor: colors.border },
    rowText: { flex: 1 },
    format: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.sm, color: colors.ink },
    meta: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.inkFaint },
    pressed: { opacity: 0.6 },
    workInstead: { marginTop: spacing.md, alignSelf: "flex-start" },
  });
}
