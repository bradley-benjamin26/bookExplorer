import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useRouter } from "expo-router";
import { useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { routes } from "../src/navigation";

export default function Scan() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const hasScanned = useRef(false);

  const handleScanned = (result: BarcodeScanningResult) => {
    if (hasScanned.current) return;
    hasScanned.current = true;
    router.replace(routes.book(result.data));
  };

  if (!permission) {
    return <View style={styles.center} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>Camera access is needed to scan book barcodes.</Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </Pressable>
      </View>
    );
  }

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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  message: { textAlign: "center", fontSize: 16 },
  button: { backgroundColor: "#1a1a2e", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  buttonText: { color: "#fff", fontWeight: "600" },
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
