import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { Request } from "express";

const scrypt = promisify(scryptCallback) as unknown as (
  password: string,
  salt: string,
  keyLength: number
) => Promise<Buffer>;
export const SESSION_DURATION_MS = 1000 * 60 * 60 * 12;

export const LOCAL_ADMIN_COOKIE_NAME = "housingpa-admin-session";

type AdminSessionPayload = {
  username: string;
  expiresAt: number;
};

function getSessionSecret() {
  return process.env.SESSION_SECRET || process.env.JWT_SECRET || "";
}

function decodePasswordHash(value: string) {
  if (/^[a-f0-9]+$/i.test(value) && value.length % 2 === 0) {
    return Buffer.from(value, "hex");
  }
  return Buffer.from(value, "base64");
}

function parseScryptHash(encoded: string) {
  const separator = encoded.includes(":")
    ? ":"
    : encoded.includes(".")
      ? "."
      : "|";
  const [salt, hash] = encoded.split(separator);
  if (!salt || !hash) return null;
  return { salt, hash: decodePasswordHash(hash) };
}

function signature(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function parseCookie(request: Request, name: string) {
  const header = request.headers?.cookie ?? "";
  const part = header
    .split(";")
    .map(item => item.trim())
    .find(item => item.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : null;
}

export async function verifyOwnerCredentials(
  username: string,
  password: string
) {
  const configuredUsername = process.env.OWNER_USERNAME;
  const configuredHash = process.env.OWNER_PASSWORD_SCRYPT;
  if (!configuredUsername || !configuredHash || username !== configuredUsername)
    return false;

  const parsed = parseScryptHash(configuredHash);
  if (!parsed) return false;

  const derived = Buffer.from(
    await scrypt(password, parsed.salt, parsed.hash.length)
  );
  return (
    derived.length === parsed.hash.length &&
    timingSafeEqual(derived, parsed.hash)
  );
}

export async function hashPassword(
  password: string,
  salt = randomBytes(16).toString("hex")
) {
  const hash = Buffer.from(await scrypt(password, salt, 64)).toString("hex");
  return `${salt}:${hash}`;
}

export function createAdminSession(
  username: string,
  secret = getSessionSecret(),
  now = Date.now()
) {
  if (!secret)
    throw new Error("Administrator session secret is not configured.");
  const payload: AdminSessionPayload = {
    username,
    expiresAt: now + SESSION_DURATION_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, secret)}`;
}

export function getLocalAdminSession(
  request: Request,
  secret = getSessionSecret(),
  now = Date.now()
) {
  if (!secret) return null;
  const token = parseCookie(request, LOCAL_ADMIN_COOKIE_NAME);
  if (!token) return null;
  const [encoded, receivedSignature] = token.split(".");
  if (!encoded || !receivedSignature) return null;

  const expectedSignature = signature(encoded, secret);
  const expectedBuffer = Buffer.from(expectedSignature);
  const receivedBuffer = Buffer.from(receivedSignature);
  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  )
    return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as AdminSessionPayload;
    if (
      payload.username !== process.env.OWNER_USERNAME ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= now
    )
      return null;
    return {
      id: 0,
      openId: "coolify-local-admin",
      name: payload.username,
      email: null,
      loginMethod: "local",
      role: "admin" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
  } catch {
    return null;
  }
}

export function localAdminCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DURATION_MS,
  };
}
