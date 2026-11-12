import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiError, connectOpenLibrary, disconnectOpenLibrary, fetchOpenLibraryAccount } from "../src/api/client";
import { Button } from "../src/components/Button";
import { Footer } from "../src/components/Footer";
import { confirmDestructive } from "../src/confirm";
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
  const account = useQuery({ queryKey: ["openlibrary", "account"], queryFn: fetchOpenLibraryAccount, enabled: hasToken, retry: false });

  const signedOut = !hasToken || status(account.error) === 401;
  const isUnavailable = unavailable || (hasToken && status(account.error) === 503);

  const signIn = async () => {
    if (busy) return;
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
        {/* Task 7: "Import a list from Open Library" section goes here. */}
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
    signOut: { alignSelf: "flex-start", marginBottom: spacing.md },
    errorText: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.danger, marginTop: spacing.sm },
  });
}
