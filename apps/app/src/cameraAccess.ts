/** What to tell someone whose camera request came back denied, since the OS/browser shows nothing itself. */
export function cameraBlockedHint(platform: string, secureContext: boolean): string {
  if (platform !== "web") return "Camera access is off for Shelf Thread. Turn it on in Settings, then come back.";
  // Browsers (iOS Safari included) only expose the camera on https pages.
  if (!secureContext) return "Your browser only allows the camera on a secure (https) page. You can type the ISBN below instead.";
  return "Your browser blocked the camera. Allow it for this site (in Safari: aA › Website Settings › Camera), then try again.";
}
