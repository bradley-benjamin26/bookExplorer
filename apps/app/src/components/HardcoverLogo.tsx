import { Image } from "expo-image";
import { hardcoverLogoSize } from "../hardcoverLogo";
import { useTheme } from "../theme";

const LIGHT = require("../../assets/hardcover/hardcover-logo-light.png");
const DARK = require("../../assets/hardcover/hardcover-logo-dark.png");

/** The Hardcover wordmark; the white-text asset on the dark theme, dark text on the light one. */
export function HardcoverLogo({ height }: { height: number }) {
  const { scheme } = useTheme();
  return (
    <Image
      source={scheme === "dark" ? DARK : LIGHT}
      style={hardcoverLogoSize(height)}
      contentFit="contain"
      accessibilityLabel="Hardcover"
    />
  );
}
