import AsyncStorage from "@react-native-async-storage/async-storage";

// Per-device, like the theme preference: not part of the library snapshot.
const FEEDBACK_BANNER_KEY = "book-explorer:feedback-banner-dismissed";

/** Any missing, unreadable or unexpected value counts as "not dismissed", so a corrupt flag shows the banner rather than hiding it for good. */
export async function isFeedbackBannerDismissed(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(FEEDBACK_BANNER_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function dismissFeedbackBanner(): Promise<void> {
  await AsyncStorage.setItem(FEEDBACK_BANNER_KEY, "1");
}
