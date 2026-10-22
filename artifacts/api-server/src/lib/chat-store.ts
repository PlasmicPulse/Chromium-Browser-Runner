import { pool } from "@workspace/db";

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

export async function saveMessage(username: string, message: string) {
  const result = await pool.query(
    `INSERT INTO chat_messages (username, message) VALUES ($1, $2) RETURNING ${columns}`,
    [username, message],
  );
  const row = result.rows[0];
  return { ...row, createdAt: row.createdAt.toISOString() };
}
