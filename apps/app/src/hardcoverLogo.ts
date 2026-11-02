/** Both Hardcover wordmark PNGs are 512x85; scale by height to keep the ratio. */
export function hardcoverLogoSize(height: number): { width: number; height: number } {
  return { width: Math.round((height * 512) / 85), height };
}
