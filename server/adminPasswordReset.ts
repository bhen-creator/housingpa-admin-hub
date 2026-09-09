import { createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import {
  consumeAdminPasswordResetToken,
  storeAdminPasswordResetToken,
} from "./db";
import { hashPassword } from "./localAdminAuth";
import { ADMIN_ACCOUNT } from "./adminAccount";
import { sendResetViaZoho, ZOHO_RESET_REQUIRED_ENV } from "./adminResetZoho";

export { ADMIN_ACCOUNT } from "./adminAccount";
export const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
export const GENERIC_RESET_RESPONSE =
  "If the authorized account is eligible, a password reset email will be sent shortly.";

const REQUIRED_SMTP_ENV = [
  "ADMIN_RESET_SMTP_HOST",
  "ADMIN_RESET_SMTP_PORT",
  "ADMIN_RESET_SMTP_SECURE",
  "ADMIN_RESET_SMTP_USERNAME",
  "ADMIN_RESET_SMTP_PASSWORD",
  "ADMIN_RESET_SMTP_FROM",
  "ADMIN_RESET_BASE_URL",
  "DATABASE_URL",
] as const;

export function passwordResetConfiguration(environment = process.env) {
  const zoho = environment.ADMIN_RESET_TRANSPORT === "zoho-api";
  const required = zoho ? [...ZOHO_RESET_REQUIRED_ENV, "ADMIN_RESET_BASE_URL", "DATABASE_URL"] : REQUIRED_SMTP_ENV;
  const missing = required.filter(name => !environment[name]?.trim());
  const baseUrl = environment.ADMIN_RESET_BASE_URL?.trim() ?? "";
  const port = Number(environment.ADMIN_RESET_SMTP_PORT);
  const secureValue = environment.ADMIN_RESET_SMTP_SECURE;
  const valid =
    missing.length === 0 &&
    environment.OWNER_USERNAME === ADMIN_ACCOUNT &&
    (zoho || (Number.isInteger(port) && port > 0 && port <= 65535 &&
    (secureValue === "true" || secureValue === "false"))) &&
    (() => {
      try {
        const url = new URL(baseUrl);
        return url.origin === "https://admin.housingpa.com" && !url.username && !url.password;
      } catch {
        return false;
      }
    })();
  return { enabled: valid, missing };
}

export function validateAdminPassword(password: string) {
  if (password.length < 14 || password.length > 256)
    return "Use between 14 and 256 characters.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password))
    return "Include both lowercase and uppercase letters.";
  if (!/\d/.test(password) || !/[^A-Za-z0-9]/.test(password))
    return "Include at least one number and one symbol.";
  const normalized = password.toLowerCase();
  if (
    normalized.includes("housingpa") ||
    normalized.includes("ben@housingpa.com") ||
    /^(password|admin|letmein|qwerty)/.test(normalized)
  )
    return "Choose a password that does not contain account details or common words.";
  return null;
}

export function hashResetToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export class ResetThrottle {
  private readonly attempts = new Map<string, number[]>();
  constructor(
    private readonly limit = 3,
    private readonly windowMs = 15 * 60 * 1000
  ) {}
  allow(key: string, now: number) {
    const recent = (this.attempts.get(key) ?? []).filter(
      attemptedAt => now - attemptedAt < this.windowMs
    );
    if (recent.length >= this.limit) {
      this.attempts.set(key, recent);
      return false;
    }
    recent.push(now);
    this.attempts.set(key, recent);
    return true;
  }
  clear() {
    this.attempts.clear();
  }
}

export type ResetMail = {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
};

export type PasswordResetDependencies = {
  storeToken: (tokenHash: string, expiresAt: Date) => Promise<void>;
  consumeToken: (
    tokenHash: string,
    passwordScrypt: string,
    now: Date
  ) => Promise<boolean>;
  sendMail: (mail: ResetMail) => Promise<void>;
  now: () => number;
  randomToken: () => string;
  environment: NodeJS.ProcessEnv;
  throttle: ResetThrottle;
  completeThrottle: ResetThrottle;
};

function productionDependencies(): PasswordResetDependencies {
  const environment = process.env;
  return {
    storeToken: storeAdminPasswordResetToken,
    consumeToken: consumeAdminPasswordResetToken,
    now: Date.now,
    randomToken: () => randomBytes(32).toString("base64url"),
    environment,
    throttle: new ResetThrottle(),
    completeThrottle: new ResetThrottle(5),
    sendMail: async mail => {
      if (environment.ADMIN_RESET_TRANSPORT === "zoho-api") {
        await sendResetViaZoho(mail, environment);
        return;
      }
      const transporter = nodemailer.createTransport({
        host: environment.ADMIN_RESET_SMTP_HOST,
        port: Number(environment.ADMIN_RESET_SMTP_PORT),
        secure: environment.ADMIN_RESET_SMTP_SECURE === "true",
        auth: {
          user: environment.ADMIN_RESET_SMTP_USERNAME,
          pass: environment.ADMIN_RESET_SMTP_PASSWORD,
        },
        requireTLS: environment.ADMIN_RESET_SMTP_SECURE !== "true",
        disableFileAccess: true,
        disableUrlAccess: true,
        tls: { minVersion: "TLSv1.2" },
      });
      await transporter.sendMail(mail);
    },
  };
}

export function createPasswordResetService(
  dependencies: PasswordResetDependencies = productionDependencies()
) {
  async function requestReset(email: string, clientIp: string) {
    const now = dependencies.now();
    const configured = passwordResetConfiguration(dependencies.environment);
    const normalizedEmail = email.trim().toLowerCase();
    const allowed = dependencies.throttle.allow(
      `${clientIp}|${ADMIN_ACCOUNT}`,
      now
    );

    if (!configured.enabled || normalizedEmail !== ADMIN_ACCOUNT || !allowed)
      return { message: GENERIC_RESET_RESPONSE };

    const token = dependencies.randomToken();
    const tokenHash = hashResetToken(token);
    const expiresAt = new Date(now + RESET_TOKEN_TTL_MS);
    const baseUrl = new URL(dependencies.environment.ADMIN_RESET_BASE_URL!);
    baseUrl.hash = `resetToken=${encodeURIComponent(token)}`;

    try {
      await dependencies.storeToken(tokenHash, expiresAt);
      await dependencies.sendMail({
        to: ADMIN_ACCOUNT,
        from: dependencies.environment.ADMIN_RESET_SMTP_FROM!,
        subject: "Reset your HousingPA Admin password",
        text: `Use this secure link within 15 minutes to choose a new password: ${baseUrl.toString()}\n\nIf you did not request this, you can ignore this email.`,
        html: `<p>Use the secure link below within 15 minutes to choose a new password.</p><p><a href="${baseUrl.toString()}">Reset Admin password</a></p><p>If you did not request this, you can ignore this email.</p>`,
      });
    } catch {
      // Preserve the generic public response and never log tokens or credentials.
      console.warn("[Admin password reset] Delivery was not completed.");
    }
    return { message: GENERIC_RESET_RESPONSE };
  }

  async function completeReset(
    token: string,
    password: string,
    clientIp = "unknown"
  ) {
    if (!passwordResetConfiguration(dependencies.environment).enabled)
      return { success: false as const, validationError: null };
    if (!dependencies.completeThrottle.allow(clientIp, dependencies.now()))
      return { success: false as const, validationError: null };
    const validationError = validateAdminPassword(password);
    if (validationError) return { success: false as const, validationError };
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(token))
      return { success: false as const, validationError: null };

    const passwordScrypt = await hashPassword(password);
    const consumed = await dependencies.consumeToken(
      hashResetToken(token),
      passwordScrypt,
      new Date(dependencies.now())
    );
    return {
      success: consumed as boolean,
      validationError: null,
    };
  }

  return { requestReset, completeReset };
}

export const passwordResetService = createPasswordResetService();
