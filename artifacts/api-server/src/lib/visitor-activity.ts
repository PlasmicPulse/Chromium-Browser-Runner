import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { pool } from "@workspace/db";

const COOKIE = "runner_activity_device";
const CHOICE = "runner_activity_choice";
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const revocations = new EventEmitter();
revocations.setMaxListeners(0);

export function onActivityRevoked(listener: (deviceId: string) => void): () => void {
  revocations.on("revoke", listener);
  return () => { revocations.off("revoke", listener); };
}

function signature(id: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for activity consent.");
  return createHmac("sha256", secret).update(`visitor-device:v1:${id}`).digest("hex");
}

export function signDeviceId(id: string): string {
  return `${id}.${signature(id)}`;
}

export function deviceIdFromToken(token: unknown): string | null {
  if (typeof token !== "string" || !/^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(token)) return null;
  const [id, mac] = token.split(".");
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) return null;
  const expected = Buffer.from(signature(id), "hex");
  const supplied = Buffer.from(mac, "hex");
  return timingSafeEqual(expected, supplied) ? id : null;
}

export function requestDeviceToken(req: Request): string | null {
  const token: unknown = req.cookies?.[COOKIE];
  return deviceIdFromToken(token) ? token as string : null;
}

export function deviceTokenFromCookieHeader(header: string | undefined): string | null {
  try {
    const cookie = header?.split(";").map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`));
    const token = cookie ? decodeURIComponent(cookie.slice(COOKIE.length + 1)) : null;
    return deviceIdFromToken(token) ? token : null;
  } catch { return null; }
}

export async function hasActivityAcceptance(token: string | null): Promise<boolean> {
  const id = deviceIdFromToken(token);
  if (!id) return false;
  const result = await pool.query(
    "SELECT 1 FROM visitor_devices WHERE device_id = $1 AND consent_active = true", [id],
  );
  return result.rowCount === 1;
}

export async function initializeActivity(): Promise<void> {
  // Additive migration runs against the current environment at startup, including production.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize first-start migrations across concurrently starting deployment instances.
    await client.query("SELECT pg_advisory_xact_lock(1784001)");
    await client.query(`
    CREATE TABLE IF NOT EXISTS visitor_devices (
      device_id UUID PRIMARY KEY, consent_active BOOLEAN NOT NULL DEFAULT true,
      first_seen TIMESTAMPTZ NOT NULL DEFAULT now(), last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
      browser TEXT NOT NULL, platform TEXT NOT NULL, username TEXT, reviewed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS page_visits (
      id SERIAL PRIMARY KEY, device_id UUID NOT NULL REFERENCES visitor_devices(device_id),
      address TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS page_visits_device_idx ON page_visits(device_id);
    ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES visitor_devices(device_id);
    `);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function readConsent(req: Request) {
  const token = requestDeviceToken(req);
  const deviceId = deviceIdFromToken(token);
  const result = deviceId ? await pool.query(
    "SELECT consent_active FROM visitor_devices WHERE device_id = $1", [deviceId],
  ) : null;
  const enabled = result?.rows[0]?.consent_active === true;
  return {
    decided: req.cookies?.[CHOICE] === "declined" || req.cookies?.[CHOICE] === "allowed" || enabled,
    enabled,
    deviceId: enabled ? deviceId : null,
    token: enabled ? token : null,
  };
}

function browserLabel(userAgent: string): { browser: string; platform: string } {
  const browser = /Edg\//.test(userAgent) ? "Edge" : /(?:OPR|Opera)\//.test(userAgent) ? "Opera"
    : /(?:Chrome|CriOS)\//.test(userAgent) ? "Chrome" : /(?:Firefox|FxiOS)\//.test(userAgent) ? "Firefox"
    : /Safari\//.test(userAgent) ? "Safari" : "Other browser";
  const platform = /(?:iPhone|iPad|iPod)/.test(userAgent) ? "iOS" : /Android/.test(userAgent) ? "Android"
    : /Windows/.test(userAgent) ? "Windows" : /Macintosh/.test(userAgent) ? "macOS"
    : /Linux/.test(userAgent) ? "Linux" : "Other platform";
  return { browser, platform };
}

export async function changeConsent(req: Request, res: Response, enabled: boolean) {
  const cookieOptions = {
    httpOnly: true, sameSite: "lax" as const, path: "/api",
    secure: process.env.NODE_ENV === "production" || req.secure || req.headers["x-forwarded-proto"] === "https",
    maxAge: YEAR_MS,
  };
  const previousId = deviceIdFromToken(requestDeviceToken(req));
  if (!enabled) {
    if (previousId) {
      await pool.query("UPDATE visitor_devices SET consent_active = false WHERE device_id = $1", [previousId]);
      revocations.emit("revoke", previousId);
    }
    res.clearCookie(COOKIE, { ...cookieOptions, maxAge: undefined });
    res.cookie(CHOICE, "declined", cookieOptions);
    return { decided: true, enabled: false, deviceId: null, token: null };
  }
  const id = previousId ?? randomUUID();
  const { browser, platform } = browserLabel(req.get("user-agent") ?? "");
  await pool.query(
    `INSERT INTO visitor_devices (device_id, browser, platform) VALUES ($1, $2, $3)
     ON CONFLICT (device_id) DO UPDATE SET consent_active = true, last_seen = now()`,
    [id, browser, platform],
  );
  const token = signDeviceId(id);
  res.cookie(COOKIE, token, cookieOptions);
  res.cookie(CHOICE, "allowed", cookieOptions);
  return { decided: true, enabled: true, deviceId: id, token };
}

export function sanitizeVisitedAddress(address: string): string | null {
  try {
    const url = new URL(address);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    // Strip credentials, query parameters, and fragments before writing any record.
    return `${url.origin}${url.pathname}`.slice(0, 2048);
  } catch {
    return null;
  }
}

export async function recordVisit(token: string | null, address: string): Promise<void> {
  const id = deviceIdFromToken(token);
  const safeAddress = sanitizeVisitedAddress(address);
  if (!id || !safeAddress) return;
  // The active flag is checked by the insert itself, including for already-open sockets.
  await pool.query(
    `WITH visited AS (
      INSERT INTO page_visits (device_id, address)
      SELECT device_id, $2 FROM visitor_devices WHERE device_id = $1 AND consent_active = true
      RETURNING device_id
    ) UPDATE visitor_devices SET last_seen = now() WHERE device_id IN (SELECT device_id FROM visited)`,
    [id, safeAddress],
  );
}

export async function recordAccess(req: Request): Promise<void> {
  const id = deviceIdFromToken(requestDeviceToken(req));
  if (id) await pool.query(
    "UPDATE visitor_devices SET last_seen = now() WHERE device_id = $1 AND consent_active = true", [id],
  );
}
