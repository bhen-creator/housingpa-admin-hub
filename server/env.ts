import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Minimal .env loader - no dependency, only fills values that are not already set. */
function loadDotEnv(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '').trim();
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadDotEnv(path.resolve(process.cwd(), '.env'));

function bool(v: string | undefined, dflt = false): boolean {
  if (v === undefined || v === '') return dflt;
  return /^(1|true|yes|on)$/i.test(v.trim());
}

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
fs.mkdirSync(DATA_DIR, {recursive: true});

/** A stable session secret, generated and persisted on first boot if not supplied. */
function resolveSecret(): string {
  const supplied = process.env.SESSION_SECRET;
  if (supplied && supplied.length >= 16) return supplied;
  const file = path.join(DATA_DIR, '.session-secret');
  try {
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  } catch {
    /* ignore */
  }
  const generated = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(file, generated, {mode: 0o600});
  } catch {
    console.warn('[env] could not persist a session secret; sign-ins will reset on restart');
  }
  return generated;
}

export type MailProvider = 'none' | 'resend' | 'postmark' | 'sendgrid' | 'mailgun';

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || '0.0.0.0',

  dataDir: DATA_DIR,
  dbPath: process.env.DB_PATH || path.join(DATA_DIR, 'minutes.sqlite'),
  sessionSecret: resolveSecret(),
  sessionDays: Number(process.env.SESSION_DAYS || 30),
  bootstrapCode: process.env.ACCESS_CODE || '',

  appUrl: (process.env.APP_URL || '').replace(/\/$/, ''),
  behindProxy: bool(process.env.BEHIND_PROXY, true),

  brandName: process.env.BRAND_NAME || 'Q&W Community Management',
  brandShort: process.env.BRAND_SHORT || 'Q&W',
  brandTagline: process.env.BRAND_TAGLINE || 'Board Meeting Minutes',
  brandAccent: process.env.BRAND_ACCENT || '#1d4ed8',
  supportEmail: process.env.SUPPORT_EMAIL || '',

  geminiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',

  mailProvider: (process.env.MAIL_PROVIDER || 'none').toLowerCase() as MailProvider,
  mailApiKey: process.env.MAIL_API_KEY || '',
  mailFrom: process.env.MAIL_FROM || '',
  mailDomain: process.env.MAILGUN_DOMAIN || '',

  sharingEnabled: bool(process.env.SHARING_ENABLED, true),
  version: process.env.APP_VERSION || '1.0.0',
};

export const aiEnabled = (): boolean => Boolean(env.geminiKey);
export const emailEnabled = (): boolean =>
  env.mailProvider !== 'none' && Boolean(env.mailApiKey) && Boolean(env.mailFrom);
