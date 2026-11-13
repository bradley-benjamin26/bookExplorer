export function listServiceLabels(service: "Hardcover" | "Open Library") {
  return { sync: `Sync with ${service}`, unlink: `Unlink ${service}`, copy: `Copy to ${service}` };
}
