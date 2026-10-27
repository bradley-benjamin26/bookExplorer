import { beforeEach, describe, expect, it, vi } from "vitest";

const rn = vi.hoisted(() => ({ Platform: { OS: "ios" }, Alert: { alert: vi.fn() } }));
vi.mock("react-native", () => rn);

import { confirmDestructive } from "./confirm";

type Button = { text: string; style?: string; onPress: () => void };
const call = () => {
  const [, , buttons, options] = rn.Alert.alert.mock.calls[0] as [string, string, Button[], { cancelable: boolean; onDismiss: () => void }];
  return { buttons, options };
};

describe("confirmDestructive", () => {
  beforeEach(() => {
    rn.Alert.alert.mockReset();
    rn.Platform.OS = "ios";
  });

  it("native Cancel resolves false", async () => {
    const p = confirmDestructive("T", "M", "Remove");
    call().buttons.find((b) => b.style === "cancel")!.onPress();
    expect(await p).toBe(false);
  });
  it("native action button resolves true", async () => {
    const p = confirmDestructive("T", "M", "Remove");
    const b = call().buttons.find((x) => x.style === "destructive")!;
    expect(b.text).toBe("Remove");
    b.onPress();
    expect(await p).toBe(true);
  });
  it("dismissing the alert resolves false", async () => {
    const p = confirmDestructive("T", "M", "Remove");
    expect(call().options.cancelable).toBe(true);
    call().options.onDismiss();
    expect(await p).toBe(false);
  });
  it("web returns window.confirm's answer", async () => {
    rn.Platform.OS = "web";
    const confirm = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    vi.stubGlobal("window", { confirm });
    expect(await confirmDestructive("T", "M", "Remove")).toBe(true);
    expect(await confirmDestructive("T", "M", "Remove")).toBe(false);
    expect(confirm).toHaveBeenCalledWith("M");
    vi.unstubAllGlobals();
  });
});
