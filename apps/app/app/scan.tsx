import { isValidIsbn, normalizeIsbn } from "@book-explorer/shared";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { isIsbnBarcode } from "../src/batchScan";
import { cameraBlockedHint } from "../src/cameraAccess";
import { BatchScan } from "../src/components/BatchScan";
import { Button } from "../src/components/Button";
import { routes } from "../src/navigation";
import { getPreferences, type Preferences } from "../src/storage/preferences";
import { useTheme, useThemedStyles, type Theme } from "../src/theme";

/** Typed fallback for when the camera is unavailable or the barcode won't read. */
function IsbnEntry() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);

  const submit = () => {
    if (!isValidIsbn(value)) return setInvalid(true);
    router.replace(routes.book(normalizeIsbn(value)));
  };

  return (
    <View style={styles.entry}>
      <Text style={styles.entryLabel} nativeID="isbn-entry-label">
        Or type the ISBN
      </Text>
      <TextInput
        style={styles.entryInput}
        accessibilityLabelledBy="isbn-entry-label"
        accessibilityLabel="Or type the ISBN"
        placeholder="978-0-14-143951-8"
        placeholderTextColor={theme.colors.inkFaint}
        value={value}
        onChangeText={(t) => {
          setValue(t);
          setInvalid(false);
        }}
        // iOS's number pad has no X, which ends some ISBN-10s.
        keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "number-pad"}
        autoCapitalize="characters"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button variant="pill" onPress={submit} style={styles.entrySubmit}>
        Open book
      </Button>
      {invalid && (
        <Text style={styles.entryError} accessibilityLiveRegion="polite">
          That isn't a valid ISBN. Check the 10 or 13 digits on the back cover.
        </Text>
      )}
    </View>
  );
}

export default function Scan() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const [permission, requestPermission] = useCameraPermissions();
  const hasScanned = useRef(false);
  const [batch, setBatch] = useState(false);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    getPreferences().then((p) => {
      setPrefs(p);
      setBatch(p.startInBatchScan);
    });
  }, []);

  const handleScanned = (result: BarcodeScanningResult) => {
    if (!isIsbnBarcode(result.data)) return;
    if (hasScanned.current) return;
    hasScanned.current = true;
    if (prefs?.scanHaptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.replace(routes.book(result.data));
  };

  // Waits for preferences too, so a batch-first setting doesn't flash the single scanner.
  if (!permission || !prefs) {
    return <View style={styles.permissionScreen} />;
  }

  if (!permission.granted) {
    // Once denied, iOS/Android never show the prompt again; only Settings can change it.
    const settingsOnly = Platform.OS !== "web" && !permission.canAskAgain;
    const allow = async () => {
      if (settingsOnly) return Linking.openSettings();
      const result = await requestPermission();
      if (!result.granted) setBlocked(true);
    };
    return (
      // Android resizes the window for the keyboard itself; iOS needs the padding.
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.permissionScreen}>
        <Text style={styles.message}>Camera access is needed to scan book barcodes.</Text>
        {blocked && (
          <Text style={styles.message} accessibilityLiveRegion="polite">
            {cameraBlockedHint(Platform.OS, typeof window === "undefined" || window.isSecureContext !== false)}
          </Text>
        )}
        <Button variant="primary" onPress={allow}>
          {settingsOnly ? "Open Settings" : "Allow camera"}
        </Button>
        <IsbnEntry />
      </KeyboardAvoidingView>
    );
  }

  if (batch) return <BatchScan haptics={prefs.scanHaptics} onExit={() => setBatch(false)} />;

  // The live camera view is deliberately always dark, regardless of the
  // app's own light/dark theme — a bright white scanning overlay would wash
  // out against the camera feed the same way it would in any camera app.
  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["ean13"] }}
        onBarcodeScanned={handleScanned}
      />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
        <View style={styles.scanBox} />
        <Text style={styles.hint}>Align the book's barcode within the frame</Text>
        <Button variant="pill" onPress={() => setBatch(true)} accessibilityLabel="Scan multiple books">
          Scan multiple
        </Button>
        <IsbnEntry />
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles({ colors, spacing, fonts, typeScale, radii }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: "#000" },
    permissionScreen: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
      gap: spacing.lg,
      backgroundColor: colors.paper,
    },
    message: { textAlign: "center", fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink, lineHeight: 24 },
    overlay: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
    scanBox: {
      width: "80%",
      height: 140,
      borderWidth: 2,
      borderColor: "#fff",
      borderRadius: 10,
    },
    hint: { color: "#fff", fontFamily: fonts.body, fontSize: 14 },
    // A paper card, so the field reads the same over the dark camera feed as on the permission screen.
    entry: { width: "80%", maxWidth: 360, gap: spacing.xs, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.paper },
    entryLabel: { fontFamily: fonts.bodySemiBold, fontSize: typeScale.xs, color: colors.ink },
    entryInput: {
      minHeight: 44,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.md,
      fontFamily: fonts.body,
      fontSize: typeScale.sm,
      color: colors.ink,
      backgroundColor: colors.background,
    },
    entrySubmit: { alignSelf: "flex-start" },
    entryError: { fontFamily: fonts.body, fontSize: typeScale.xs, color: colors.danger },
  });
}
