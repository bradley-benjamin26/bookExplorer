import { useRouter } from "expo-router";
import { ArrowDownUp, Settings, Sparkles, Waypoints } from "lucide-react-native";
import { View } from "react-native";
import { routes } from "../navigation";
import { AboutButton } from "./AboutButton";
import { AccountsButton } from "./AccountsButton";
import { HeaderIconButton } from "./HeaderIconButton";
import { MyLibraryButton } from "./MyLibraryButton";
import { NewSearchButton } from "./NewSearchButton";

type Action = "about" | "library" | "recommendations" | "connection" | "backup" | "settings" | "accounts" | "search";

const ALL: Action[] = ["about", "library", "recommendations", "connection", "backup", "settings", "accounts", "search"];

/** Header buttons in a fixed order; screens pass `show` to leave some out. */
export function HeaderActions({ show = ALL }: { show?: Action[] }) {
  const router = useRouter();
  const go = (href: ReturnType<typeof routes.backup>) => () => router.push(href);
  return (
    <View role="navigation" accessibilityLabel="Site" style={{ flexDirection: "row", gap: 0 }}>
      {show.includes("about") && <AboutButton />}
      {show.includes("library") && <MyLibraryButton />}
      {show.includes("recommendations") && <HeaderIconButton label="Recommendations" Icon={Sparkles} onPress={go(routes.recommendations())} />}
      {show.includes("connection") && <HeaderIconButton label="Find connection" Icon={Waypoints} onPress={go(routes.connection())} />}
      {show.includes("backup") && <HeaderIconButton label="Import & export" Icon={ArrowDownUp} onPress={go(routes.backup())} />}
      {show.includes("settings") && <HeaderIconButton label="Settings" Icon={Settings} onPress={go(routes.settings())} />}
      {show.includes("accounts") && <AccountsButton />}
      {show.includes("search") && <NewSearchButton iconOnly />}
    </View>
  );
}
