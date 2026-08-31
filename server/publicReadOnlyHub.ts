/**
 * Runtime switch for the deliberately limited public dashboard view.
 *
 * This must stay opt-in. The flag exposes only the separately-sanitized
 * public catalogue; it does not weaken any administrator or mutation route.
 */
export const PUBLIC_READ_ONLY_HUB_ENV = "PUBLIC_READ_ONLY_HUB";

export function isPublicReadOnlyHubEnabled(
  value = process.env[PUBLIC_READ_ONLY_HUB_ENV]
) {
  return value === "true";
}
