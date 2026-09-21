import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useRouter } from "expo-router";
import { useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../src/components/Button";
import { routes } from "../src/navigation";
import { useThemedStyles, type Theme } from "../src/theme";

export default function Scan() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const [permission, requestPermission] = useCameraPermissions();
  const hasScanned = useRef(false);

  const handleScanned = (result: BarcodeScanningResult) => {
    if (hasScanned.current) return;
    hasScanned.current = true;
    router.replace(routes.book(result.data));
  };

  if (!permission) {
    return <View style={styles.permissionScreen} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionScreen}>
        <Text style={styles.message}>Camera access is needed to scan book barcodes.</Text>
        <Button variant="primary" onPress={requestPermission}>
          Grant Permission
        </Button>
      </View>
    );
  }

  // The live camera view is deliberately always dark, regardless of the
  // app's own light/dark theme — a bright white scanning overlay would wash
  // out against the camera feed the same way it would in any camera app.
  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
        onBarcodeScanned={handleScanned}
      />
      <View style={styles.overlay}>
        <View style={styles.scanBox} />
        <Text style={styles.hint}>Align the book's barcode within the frame</Text>
      </View>
    </View>
  );
}

function createStyles({ colors }: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: "#000" },
    permissionScreen: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      gap: 16,
      backgroundColor: colors.background,
    },
    message: { textAlign: "center", fontSize: 16, color: colors.text },
    overlay: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
    scanBox: {
      width: "80%",
      height: 140,
      borderWidth: 2,
      borderColor: "#fff",
      borderRadius: 12,
    },
    hint: { color: "#fff", fontSize: 14 },
  });
}
