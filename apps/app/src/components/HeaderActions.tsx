import { View } from "react-native";
import { AboutButton } from "./AboutButton";
import { MyLibraryButton } from "./MyLibraryButton";
import { NewSearchButton } from "./NewSearchButton";

type Action = "about" | "library" | "search";

/** Header buttons in a fixed order (About, My Library, New Search); screens pass `show` to leave one out. */
export function HeaderActions({ show = ["about", "library", "search"] }: { show?: Action[] }) {
  return (
    <View style={{ flexDirection: "row", gap: 0 }}>
      {show.includes("about") && <AboutButton />}
      {show.includes("library") && <MyLibraryButton />}
      {show.includes("search") && <NewSearchButton iconOnly />}
    </View>
  );
}
