import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { API_BASE_URL, redeemHardcoverHandoff } from "./api/client";
import { saveSession } from "./hardcoverSession";

export function parseConnectReturn(url: string): { handoff: string } | { error: "denied" | "failed" } | null {
  const q = url.split("#")[0].split("?")[1];
  const params = new URLSearchParams(q ?? "");
  const handoff = params.get("handoff");
  if (handoff) return { handoff };
  const error = params.get("error");
  if (error) return { error: error === "denied" ? "denied" : "failed" };
  return null;
}

// On Android the auth-session redirect can also deep-link into the connected screen, and the code is single use.
// Callers share one in-flight redemption, so a second caller resolves only once the session is saved.
const redeemed = new Map<string, Promise<void>>();

/** Redeems and saves a handoff code once; repeat calls await the same redemption (and see its error). */
export function redeemOnce(handoff: string): Promise<void> {
  let p = redeemed.get(handoff);
  if (!p) {
    p = redeemHardcoverHandoff(handoff).then(({ token }) => saveSession(token));
    redeemed.set(handoff, p);
    p.catch(() => redeemed.delete(handoff)); // a failure must not be remembered as success
  }
  return p;
}

// A top-level navigation, so the server can bind the sign-in to this browser with a cookie.
const connectUrl = (returnTo: string) => `${API_BASE_URL}/api/hardcover/connect?returnTo=${encodeURIComponent(returnTo)}`;

export async function connectHardcover(): Promise<"connected" | "cancelled" | "redirected"> {
  if (Platform.OS === "web") {
    window.location.assign(connectUrl(`${window.location.origin}/hardcover-connected`));
    return "redirected";
  }
  const returnUrl = Linking.createURL("hardcover-connected");
  const result = await WebBrowser.openAuthSessionAsync(connectUrl(returnUrl), returnUrl);
  if (result.type !== "success") return "cancelled";
  const parsed = parseConnectReturn(result.url);
  if (!parsed || "error" in parsed) throw new Error("Hardcover wasn't connected.");
  await redeemOnce(parsed.handoff);
  return "connected";
}
