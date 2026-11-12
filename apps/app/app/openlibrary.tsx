import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiError, connectOpenLibrary, disconnectOpenLibrary, fetchOpenLibraryAccount, fetchOpenLibraryLists } from "../src/api/client";
import { Button } from "../src/components/Button";
import { Footer } from "../src/components/Footer";
import { confirmDestructive } from "../src/confirm";
import { routes } from "../src/navigation";
import { importOpenLibraryList } from "../src/openLibraryLists";
import { getLists } from "../src/storage/savedLists";
import { prefetchMissingSaved } from "../src/useSavedPrefetch";
import { clearOpenLibrarySession, getOpenLibrarySessionToken, saveOpenLibrarySession } from "../src/openLibrarySession";
import { useThemedStyles, type Theme } from "../src/theme";

const UNAVAILABLE = "Open Library sign-in isn't available on this server.";
const KEYS_URL = "https://archive.org/account/s3.php";
const status = (e: unknown) => (e instanceof ApiError ? e.status : 0);

export default function OpenLibraryAccount() {
  const styles = useThemedStyles(createStyles);
  const queryClient = useQueryClient();
  // Signed out is decided locally; the server is only asked to confirm a token we hold.
  const [hasToken, setHasToken] = useState(() => getOpenLibrarySessionToken() !== null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState("");
  // Keys live only here and are cleared after any result.
  const [access, setAccess] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // see importingRef
  // A 401 clears the stored session inside request(); follow it here, or the removed query would refetch tokenless in a loop.
  const account = useQuery({
    queryKey: ["openlibrary", "account"],
    queryFn: () =>
      fetchOpenLibraryAccount().catch((err) => {
        if (status(err) === 401) setHasToken(false);
        throw err;
      }),
    enabled: hasToken && getOpenLibrarySessionToken() !== null,
    retry: false,
  });

  const router = useRouter();
  const [importing, setImporting] = useState<string | null>(null); // the list being imported
  // State lags a render, so a fast second tap would pass an `importing` check; the ref flips synchronously.
  const importingRef = useRef(false);
  const remote = useQuery({ queryKey: ["openlibrary", "lists"], queryFn: fetchOpenLibraryLists, enabled: !!account.data, retry: false });
  const local = useQuery({ queryKey: ["openlibrary", "linked"], queryFn: () => getLists(), enabled: !!account.data });
  const linkedTo = (id: string) => local.data?.find((l) => l.openLibraryListId === id);

  const doImport = async (id: string) => {
    if (importingRef.current) return;
    importingRef.current = true;
    setImporting(id);
    setError("");
    try {
      const { list, skipped: s } = await importOpenLibraryList(id);
      void prefetchMissingSaved(queryClient);
      await queryClient.invalidateQueries({ queryKey: ["openlibrary"] });
      router.push({ pathname: "/lists/[id]", params: { id: list.id, ...(s.length ? { skipped: JSON.stringify(s), from: "openlibrary" } : {}) } });
    } catch (err) {
      setError((err as Error).message);
    }
    importingRef.current = false;
    setImporting(null);
  };

  const signedOut = !hasToken || getOpenLibrarySessionToken() === null || status(account.error) === 401;
  const isUnavailable = unavailable || (hasToken && status(account.error) === 503);

  const signIn = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const { token } = await connectOpenLibrary(access.trim(), secret.trim());
      await saveOpenLibrarySession(token);
      setHasToken(true);
      await queryClient.invalidateQueries({ queryKey: ["openlibrary"] });
    } catch (err) {
      if (status(err) === 503) setUnavailable(true);
      else setError((err as Error).message);
    }
    setAccess("");
    setSecret("");
    busyRef.current = false;
    setBusy(false);
  };

  const signOut = async () => {
    if (!(await confirmDestructive("Sign out of Open Library?", "ShelfThread will stop using your Open Library account.", "Sign out"))) return;
    await disconnectOpenLibrary().catch(() => {}); // best effort: the local session goes either way
    await clearOpenLibrarySession(); // also drops cached Open Library data, via _layout's onOpenLibrarySessionCleared
    setHasToken(false);
  };

  let body;
  if (isUnavailable) body = <Text style={styles.helpText}>{UNAVAILABLE}</Text>;
  else if (signedOut)
    body = (
      <>
        <Text style={styles.helpText}>Sign in with your archive.org S3 keys to import your Open Library lists and send lists to your account.</Text>
        <Pressable onPress={() => WebBrowser.openBrowserAsync(KEYS_URL)} accessibilityRole="link" style={styles.linkRow}>
          <Text style={styles.link}>Get your keys at archive.org</Text>
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder="Access key"
          placeholderTextColor={styles.placeholder.color}
          accessibilityLabel="Access key"
          secureTextEntry
          autoCorrect={false}
          autoCapitalize="none"
          value={access}
          onChangeText={setAccess}
        />
        <TextInput
          style={styles.input}
          placeholder="Secret key"
          placeholderTextColor={styles.placeholder.color}
          accessibilityLabel="Secret key"
          secureTextEntry
          autoCorrect={false}
          autoCapitalize="none"
          value={secret}
          onChangeText={setSecret}
        />
        <Button variant="primary" disabled={busy || !access.trim() || !secret.trim()} onPress={signIn}>Sign in</Button>
      </>
    );
  else if (account.data)
    body = (
      <>
        <Text style={styles.connected}>Signed in as @{account.data.username}</Text>
        <Button variant="pill" onPress={signOut} style={styles.signOut}>Sign out</Button>
        <Text style={styles.helpText}>To revoke ShelfThread's access, generate new keys at archive.org.</Text>
        <Text style={styles.heading} accessibilityRole="header">Import a list from Open Library</Text>
        {remote.error ? <Text style={styles.errorText}>{remote.error.message}</Text> : null}
        {remote.isPending && !remote.error ? <Text style={styles.helpText}>Loading your lists…</Text> : null}
        {remote.data?.length === 0 ? <Text style={styles.helpText}>You have no Open Library lists yet.</Text> : null}
        {remote.data?.map((l) => {
          const mine = linkedTo(l.id);
          return (
            <View key={l.id} style={styles.row}>
              <Text style={styles.rowText}>{l.name} · {l.seedCount} items</Text>
              {mine ? (
                <Button variant="pill" onPress={() => router.push(routes.list(mine.id))} accessibilityLabel={`Open imported list ${l.name}`}>Imported</Button>
              ) : (
                <Button variant="pill" disabled={importing !== null} onPress={() => doImport(l.id)} accessibilityLabel={`Import ${l.name}`}>
                  {importing === l.id ? "Importing…" : "Import"}
                </Button>
              )}
            </View>
          );
        })}
      </>
    );
  else if (account.error) body = <Text style={styles.errorText}>{account.error.message}</Text>;
  else body = <Text style={styles.helpText}>Loading…</Text>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {body}
      {error ? <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text> : null}
      <Footer />
    </ScrollView>
  );
}

function createStyles({ colors, spacing, fonts, typeScale, radii }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.paper },
    content: { flexGrow: 1, padding: spacing.lg },
    helpText: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.inkFaint, lineHeight: 22, marginBottom: spacing.md },
    connected: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginBottom: spacing.md },
    linkRow: { alignSelf: "flex-start", marginBottom: spacing.md },
    link: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.cover, textDecorationLine: "underline" },
    input: {
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: radii.sm,
      paddingHorizontal: 14,
      paddingVertical: spacing.md,
      marginBottom: spacing.md,
      fontFamily: fonts.body,
      fontSize: typeScale.sm,
      color: colors.ink,
    },
    placeholder: { color: colors.inkFaint },
    heading: { fontFamily: fonts.displayMedium, fontSize: typeScale.md, color: colors.ink, marginTop: spacing.xl, marginBottom: spacing.sm },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm, paddingVertical: 8 },
    rowText: { flex: 1, fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink },
    signOut: { alignSelf: "flex-start", marginBottom: spacing.md },
    errorText: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.danger, marginTop: spacing.sm },
  });
}
