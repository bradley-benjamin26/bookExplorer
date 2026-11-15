import { useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { ScanBarcode } from "lucide-react-native";
import { useRef, useState } from "react";
import { Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { isIsbnBarcode } from "../batchScan";
import { cameraBlockedHint } from "../cameraAccess";
import { Button } from "./Button";
import { ScanCamera } from "./ScanCamera";
import { titleRef } from "../webTitle";
import { useTheme, useThemedStyles, type Theme } from "../theme";

/** A small orange barcode button that opens the camera and hands back the first ISBN it reads. */
export function IsbnScanButton({ onScanned }: { onScanned: (isbn: string) => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [permission, requestPermission] = useCameraPermissions();
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const scanned = useRef(false);

  const handleScanned = (result: BarcodeScanningResult) => {
    if (!isIsbnBarcode(result.data) || scanned.current) return;
    scanned.current = true;
    setOpen(false);
    onScanned(result.data);
  };

  // Once denied, iOS/Android never show the prompt again; only Settings can change it.
  const settingsOnly = Platform.OS !== "web" && permission?.canAskAgain === false;
  const allow = async () => {
    if (settingsOnly) return Linking.openSettings();
    if (!(await requestPermission()).granted) setBlocked(true);
  };

  return (
    <>
      <Pressable
        ref={titleRef("Scan an ISBN")}
        onPress={() => {
          scanned.current = false;
          setBlocked(false);
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Scan an ISBN barcode into the search"
        hitSlop={8}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <ScanBarcode size={14} color={theme.colors.primaryText} />
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        {permission?.granted ? (
          // Always dark, like the main scanner: a light overlay washes out the camera feed.
          <View style={styles.camera}>
            <ScanCamera onBarcodeScanned={handleScanned} />
            <View style={styles.overlay}>
              <View style={styles.scanBox} />
              <Text style={styles.hint}>Hold the barcode in the frame, about 15 cm (6 in) away</Text>
              <Button variant="pill" onPress={() => setOpen(false)}>
                Cancel
              </Button>
            </View>
          </View>
        ) : (
          <View style={styles.permission}>
            <Text style={styles.message}>Camera access is needed to scan book barcodes.</Text>
            {blocked && (
              <Text style={styles.message} accessibilityLiveRegion="polite">
                {cameraBlockedHint(Platform.OS, typeof window === "undefined" || window.isSecureContext !== false)}
              </Text>
            )}
            <Button variant="primary" onPress={allow}>
              {settingsOnly ? "Open Settings" : "Allow camera"}
            </Button>
            <Button variant="pill" onPress={() => setOpen(false)}>
              Cancel
            </Button>
          </View>
        )}
      </Modal>
    </>
  );
}

function createStyles({ colors, fonts, typeScale, spacing, radii }: Theme) {
  return StyleSheet.create({
    // 20×20 matches the search box's magnifying glass.
    button: { width: 20, height: 20, borderRadius: radii.sm, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    pressed: { opacity: 0.6 },
    camera: { flex: 1, backgroundColor: "#000" },
    overlay: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
    scanBox: { width: "80%", height: 140, borderWidth: 2, borderColor: "#fff", borderRadius: 10 },
    hint: { color: "#fff", fontFamily: fonts.body, fontSize: 14 },
    permission: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.lg, backgroundColor: colors.paper },
    message: { textAlign: "center", fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink, lineHeight: 24 },
  });
}
