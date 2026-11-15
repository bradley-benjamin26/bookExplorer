import { CameraView, type BarcodeScanningResult } from "expo-camera";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "./Button";

// About 2x on most phones. The phone is then held farther from the book, past the
// main lens's close-focus limit (~20 cm on newer iPhones), so the barcode stays sharp.
const SCAN_ZOOM = 0.15;

/** The full-screen camera every scanner shares: EAN-13 only, a little zoom, and a light toggle for dim rooms. */
export function ScanCamera({ onBarcodeScanned }: { onBarcodeScanned: (result: BarcodeScanningResult) => void }) {
  const [torch, setTorch] = useState(false);
  return (
    <>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        zoom={SCAN_ZOOM}
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ["ean13"] }}
        onBarcodeScanned={onBarcodeScanned}
      />
      <View style={styles.torch}>
        <Button variant="pill" onPress={() => setTorch((t) => !t)} accessibilityLabel={torch ? "Turn off light" : "Turn on light"}>
          {torch ? "Light off" : "Light on"}
        </Button>
      </View>
    </>
  );
}

const styles = StyleSheet.create({ torch: { position: "absolute", top: 16, right: 16, zIndex: 1 } });
