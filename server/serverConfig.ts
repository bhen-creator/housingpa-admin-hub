export const REQUEST_BODY_LIMIT = "1mb";

export function configuredPort(value = process.env.PORT) {
  const candidate = value?.trim() || "3000";
  if (!/^\d+$/.test(candidate))
    throw new Error("PORT must be an integer between 1 and 65535.");
  const port = Number(candidate);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return port;
}
