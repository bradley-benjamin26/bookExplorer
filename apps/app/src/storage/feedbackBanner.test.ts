import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "../test/asyncStorageMock";
import { dismissFeedbackBanner, isFeedbackBannerDismissed } from "./feedbackBanner";

vi.mock("@react-native-async-storage/async-storage", () => import("../test/asyncStorageMock"));

const KEY = "book-explorer:feedback-banner-dismissed";

describe("feedbackBanner", () => {
  beforeEach(() => AsyncStorage.clear());

  it("is not dismissed when nothing is stored", async () => {
    expect(await isFeedbackBannerDismissed()).toBe(false);
  });

  it("is dismissed after dismissFeedbackBanner()", async () => {
    await dismissFeedbackBanner();
    expect(await isFeedbackBannerDismissed()).toBe(true);
  });

  it.each(["yes", "{"])("treats the unreadable value %j as not dismissed", async (value) => {
    await AsyncStorage.setItem(KEY, value);
    expect(await isFeedbackBannerDismissed()).toBe(false);
  });

  it("treats a failed read as not dismissed", async () => {
    vi.spyOn(AsyncStorage, "getItem").mockRejectedValueOnce(new Error("boom"));
    expect(await isFeedbackBannerDismissed()).toBe(false);
  });
});
