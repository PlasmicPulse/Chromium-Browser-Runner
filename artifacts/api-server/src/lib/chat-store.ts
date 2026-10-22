import { pool } from "@workspace/db";
import { deviceIdFromToken } from "./visitor-activity";

// Additive, idempotent setup also runs on the published server.
export async function initializeChat(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
}

const columns = `id, username, message, created_at AS "createdAt"`;

export async function listMessages() {
  const result = await pool.query(`SELECT ${columns} FROM chat_messages ORDER BY id DESC LIMIT 50`);
  return result.rows.reverse().map(row => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function saveMessage(username: string, message: string, trackingToken: string | null = null) {
  const deviceId = deviceIdFromToken(trackingToken);
  const result = await pool.query(
    `WITH sent AS (
      INSERT INTO chat_messages (username, message, device_id)
      VALUES ($1, $2, (SELECT device_id FROM visitor_devices WHERE device_id = $3 AND consent_active = true))
      RETURNING ${columns}, device_id
    ), touched AS (
      UPDATE visitor_devices SET username = $1, last_seen = now() WHERE device_id IN (SELECT device_id FROM sent)
    ) SELECT id, username, message, "createdAt" FROM sent`,
    [username, message, deviceId],
  );
  const row = result.rows[0];
  return { ...row, createdAt: row.createdAt.toISOString() };
}
