import { Alert, Platform } from "react-native";

/** Asks before something that can't be undone; resolves true only when the person picks the action. */
export function confirmDestructive(title: string, message: string, action: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(message));
  return new Promise((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: action, style: "destructive", onPress: () => resolve(true) },
      ],
      // Android back / tap outside closes the alert without a button.
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}

/** The shared warning for an item that would leave its last list. */
export const confirmLeave = (title: string) =>
  confirmDestructive("Remove from your library?", `“${title}” is on no other list, so it leaves your library and its notes are deleted. This can't be undone.`, "Remove");
