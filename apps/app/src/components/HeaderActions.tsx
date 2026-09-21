import { View } from "react-native";
import { MyLibraryButton } from "./MyLibraryButton";
import { NewSearchButton } from "./NewSearchButton";

/** Combines the New Search and My Library header buttons for screens that need both. */
export function HeaderActions() {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <MyLibraryButton />
      <NewSearchButton />
    </View>
  );
}
