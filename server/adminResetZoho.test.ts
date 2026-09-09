import { describe, it, expect, vi } from "vitest";
import { sendResetViaZoho } from "./adminResetZoho";
import { passwordResetConfiguration } from "./adminPasswordReset";

const environment = {
  OWNER_USERNAME: "ben@housingpa.com",
  ADMIN_RESET_TRANSPORT: "zoho-api",
  ADMIN_RESET_BASE_URL: "https://admin.housingpa.com/",
  DATABASE_URL: "mysql://synthetic",
  ADMIN_RESET_ZOHO_CLIENT_ID: "synthetic-id",
  ADMIN_RESET_ZOHO_CLIENT_SECRET: "synthetic-secret",
  ADMIN_RESET_ZOHO_REFRESH_TOKEN: "synthetic-refresh",
  ADMIN_RESET_ZOHO_ACCOUNT_ID: "12345",
};
const mail = { to: "ben@housingpa.com", from: "ben@housingpa.com", subject: "Reset your HousingPA Admin password", text: "synthetic reset link", html: "" };
describe("Zoho owner recovery transport", () => {
  it("enables with API credentials without an SMTP password", () => {
    expect(passwordResetConfiguration(environment).enabled).toBe(true);
    expect(passwordResetConfiguration({ ...environment, ADMIN_RESET_ZOHO_REFRESH_TOKEN: "" }).enabled).toBe(false);
    expect(passwordResetConfiguration({ ...environment, ADMIN_RESET_BASE_URL: "https://attacker.example" }).enabled).toBe(false);
  });
  it("sends only to the fixed owner after refresh and provider acceptance", async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "fake-access" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: { code: 200 }, data: { messageId: "fake-id" } })));
    await sendResetViaZoho(mail, environment, request);
    expect(request).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(request.mock.calls[1][1].body);
    expect(payload.toAddress).toBe("ben@housingpa.com");
    expect(payload.content).toBe(mail.text);
    expect(request.mock.calls[1][0]).toBe("https://mail.zoho.com/api/accounts/12345/messages");
  });
  it("rejects another recipient before any provider call", async () => {
    const request = vi.fn();
    await expect(sendResetViaZoho({ ...mail, to: "other@example.test" }, environment, request)).rejects.toThrow("unavailable");
    expect(request).not.toHaveBeenCalled();
  });
  it("does not send if OAuth refresh fails", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant" })));
    await expect(sendResetViaZoho(mail, environment, request)).rejects.toThrow("unavailable");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("does not claim success for a provider error returned with HTTP 200", async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "fake" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: { code: 500 } })));
    await expect(sendResetViaZoho(mail, environment, request)).rejects.toThrow("unavailable");
  });
});
