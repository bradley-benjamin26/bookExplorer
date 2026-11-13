import { useRouter } from "expo-router";
import { ArrowDownUp, CircleHelp, Library, Menu, Search, Settings, Sparkles, UserRound, Waypoints, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { routes } from "../navigation";
import { useTheme, useThemedStyles, type Theme } from "../theme";
import { AboutButton } from "./AboutButton";
import { AccountsButton, AccountsPanels } from "./AccountsButton";
import { Button } from "./Button";
import { CenteredModal } from "./CenteredModal";
import { HeaderIconButton } from "./HeaderIconButton";
import { MyLibraryButton } from "./MyLibraryButton";
import { NewSearchButton } from "./NewSearchButton";

type Action = "about" | "library" | "recommendations" | "connection" | "backup" | "settings" | "accounts" | "search";

const ALL: Action[] = ["about", "library", "recommendations", "connection", "backup", "settings", "accounts", "search"];

/** Below this width the row of 44px icons would cover the header title, so they fold into a menu. */
export const HEADER_MENU_MAX_WIDTH = 600;

/** Header buttons in a fixed order; screens pass `show` to leave some out. */
export function HeaderActions({ show = ALL }: { show?: Action[] }) {
  const router = useRouter();
  const narrow = useWindowDimensions().width < HEADER_MENU_MAX_WIDTH;
  const go = (href: ReturnType<typeof routes.backup>) => () => router.push(href);
  if (narrow) return <HeaderMenu show={show} />;
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

function HeaderMenu({ show }: { show: Action[] }) {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [view, setView] = useState<"closed" | "menu" | "accounts">("closed");
  const close = () => setView("closed");
  const go = (to: () => void) => () => {
    close();
    to();
  };
  const items: Record<Action, [string, LucideIcon, () => void]> = {
    about: ["About Shelf Thread", CircleHelp, go(() => router.push(routes.about()))],
    library: ["My Library", Library, go(() => router.push(routes.saved()))],
    recommendations: ["Recommendations", Sparkles, go(() => router.push(routes.recommendations()))],
    connection: ["Find connection", Waypoints, go(() => router.push(routes.connection()))],
    backup: ["Import & export", ArrowDownUp, go(() => router.push(routes.backup()))],
    settings: ["Settings", Settings, go(() => router.push(routes.settings()))],
    accounts: ["Accounts", UserRound, () => setView("accounts")],
    search: ["New search", Search, go(() => router.replace("/"))],
  };
  return (
    <>
      <HeaderIconButton label="Menu" Icon={Menu} onPress={() => setView("menu")} />
      <CenteredModal visible={view !== "closed"} label={view === "accounts" ? "Accounts" : "Menu"} onClose={close}>
        {view === "accounts" ? (
          <AccountsPanels onClose={close} />
        ) : (
          <ScrollView contentContainerStyle={styles.content} role="navigation" accessibilityLabel="Site">
            {show.map((action) => {
              const [label, Icon, onPress] = items[action];
              return (
                <Pressable
                  key={action}
                  onPress={onPress}
                  accessibilityRole="button"
                  style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [
                    styles.row,
                    pressed && { opacity: 0.6 },
                    // RN Web only; same focus ring as Button.
                    focused && { outlineWidth: 3, outlineOffset: 2, outlineColor: theme.colors.focus, outlineStyle: "solid" as const },
                  ]}
                >
                  <Icon size={20} color={theme.colors.ink} />
                  <Text style={styles.label}>{label}</Text>
                </Pressable>
              );
            })}
            <Button variant="pill" onPress={close} style={styles.close}>Close</Button>
          </ScrollView>
        )}
      </CenteredModal>
    </>
  );
}

function createStyles({ colors, spacing, fonts, typeScale }: Theme) {
  return StyleSheet.create({
    content: { padding: spacing.lg },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 48 },
    label: { fontFamily: fonts.body, fontSize: typeScale.sm, color: colors.ink },
    close: { marginTop: spacing.lg, alignSelf: "flex-start" },
  });
}
