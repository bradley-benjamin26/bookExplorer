import { MAX_IMPORT_BYTES } from "@book-explorer/shared";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { ImportError } from "./backup";

/** Hands an exported file to the user: a download on web, the share sheet on native. */
export async function shareFile(name: string, text: string, mimeType: string): Promise<void> {
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
}

function checkSize(bytes: number | null) {
  if (bytes !== null && bytes > MAX_IMPORT_BYTES) throw new ImportError("That file is too large to import (5 MB max).");
}

/** The text of a file the user picks, or null if they cancel. Size is checked before reading. */
export async function pickFileText(accept: string): Promise<string | null> {
  if (Platform.OS === "web") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    const picked = await new Promise<globalThis.File | null>((resolve) => {
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.oncancel = () => resolve(null);
      input.click();
    });
    if (!picked) return null;
    checkSize(picked.size);
    return picked.text();
  }
  const picked = await File.pickFileAsync({ mimeTypes: "*/*" });
  if (picked.canceled) return null;
  checkSize(picked.result.size);
  return picked.result.text();
}
