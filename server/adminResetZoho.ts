import { ADMIN_ACCOUNT } from "./adminAccount";
import type { ResetMail } from "./adminPasswordReset";

export const ZOHO_RESET_REQUIRED_ENV = [
  "ADMIN_RESET_ZOHO_CLIENT_ID",
  "ADMIN_RESET_ZOHO_CLIENT_SECRET",
  "ADMIN_RESET_ZOHO_REFRESH_TOKEN",
  "ADMIN_RESET_ZOHO_ACCOUNT_ID",
] as const;

/** Transactional recovery transport: fixed provider and fixed owner recipient. */
export async function sendResetViaZoho(
  mail: ResetMail,
  environment: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch
) {
  if (mail.to !== ADMIN_ACCOUNT || ZOHO_RESET_REQUIRED_ENV.some(key => !environment[key]?.trim()))
    throw new Error("Reset delivery unavailable.");
  const accountId = environment.ADMIN_RESET_ZOHO_ACCOUNT_ID!;
  if (!/^\d+$/.test(accountId)) throw new Error("Reset delivery unavailable.");
  const signal = AbortSignal.timeout(20_000);
  const refreshed = await request("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    redirect: "error",
    signal,
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: environment.ADMIN_RESET_ZOHO_CLIENT_ID!,
      client_secret: environment.ADMIN_RESET_ZOHO_CLIENT_SECRET!,
      refresh_token: environment.ADMIN_RESET_ZOHO_REFRESH_TOKEN!,
    }),
  });
  if (!refreshed.ok) throw new Error("Reset delivery unavailable.");
  const auth = await refreshed.json() as { access_token?: string };
  if (!auth.access_token) throw new Error("Reset delivery unavailable.");
  const sent = await request(`https://mail.zoho.com/api/accounts/${accountId}/messages`, {
    method: "POST",
    redirect: "error",
    signal,
    headers: {
      Authorization: `Zoho-oauthtoken ${auth.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fromAddress: ADMIN_ACCOUNT,
      toAddress: ADMIN_ACCOUNT,
      subject: mail.subject,
      content: mail.text,
      mailFormat: "plaintext",
    }),
  });
  if (!sent.ok) throw new Error("Reset delivery unavailable.");
  const result = await sent.json() as { status?: { code?: number }; data?: { messageId?: string } };
  if (result.status?.code !== 200 || !result.data?.messageId)
    throw new Error("Reset delivery unavailable.");
  // Record provider acceptance without logging the link, message, or credentials.
  console.info("[Admin password reset] Recovery email accepted by Zoho.");
}
