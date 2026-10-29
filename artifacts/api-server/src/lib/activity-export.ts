import type { Response } from "express";
import { pool } from "@workspace/db";

type ActivityExportRow = { id: number; device_id: string; created_at: Date } & (
  { username: string; message: string } | { address: string; cursor_time: string; username: string | null }
);

async function write(res: Response, text: string): Promise<void> {
  if (res.destroyed || res.write(text)) return;
  await new Promise<void>((resolve) => {
    const finish = () => {
      res.off("drain", finish);
      res.off("close", finish);
      resolve();
    };
    res.once("drain", finish);
    res.once("close", finish);
    if (res.destroyed) finish();
  });
}

// JSON escaping keeps each entry on one line, even for multiline/untrusted chat content.
export const logField = (value: string): string => JSON.stringify(value).replace(/[\u2028\u2029]/g, " ");

export async function exportActivity(res: Response, kind: "chat" | "visits"): Promise<void> {
  const chat = kind === "chat";
  const table = chat ? "chat_messages" : "page_visits";
  const filter = chat ? "WHERE device_id IS NOT NULL" : "";
  const snapshot = await pool.query(`SELECT COALESCE(MAX(id), 0) AS max FROM ${table} ${filter}`);
  const maxId = Number(snapshot.rows[0].max);
  res.status(200);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${chat ? "chat-log" : "visited-addresses"}.txt"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  await write(res, [
    chat ? "COMMUNITY CHAT ACTIVITY" : "VISITED WEB ADDRESSES",
    `Exported: ${new Date().toISOString()}`,
    "All timestamps are UTC. Only activity recorded after explicit opt-in is included.",
    "Device IDs identify consenting browser profiles, not a verified person or physical device.",
    chat ? "Messages are JSON-escaped to preserve one record per line." : "Addresses exclude credentials, query strings, and fragments.",
    ...(chat ? [] : [
      "Visit order: newest to oldest.",
      "current_username is the browser profile's latest self-chosen name at export time, not a verified identity or a name recorded at the time of the visit. null means no name chosen.",
    ]),
    "Stopping logging prevents future entries; previously recorded entries remain.",
    "",
  ].join("\n") + "\n");
  let cursor = 0;
  // Keep PostgreSQL's full timestamp precision; JS Date cursors would lose microseconds.
  let visitCursor: string | null = null;
  while (!res.destroyed) {
    const result: { rows: ActivityExportRow[] } = await pool.query(
      chat
        ? `SELECT id, device_id, created_at, username, message FROM chat_messages
           WHERE id > $1 AND id <= $2 AND device_id IS NOT NULL ORDER BY id LIMIT 500`
        : `SELECT v.id, v.device_id, v.created_at, v.created_at::text AS cursor_time, v.address, d.username
           FROM page_visits v LEFT JOIN visitor_devices d ON d.device_id = v.device_id
           WHERE v.id <= $3 AND ($1::timestamptz IS NULL OR (v.created_at, v.id) < ($1::timestamptz, $2::bigint))
           ORDER BY v.created_at DESC, v.id DESC LIMIT 500`,
      chat ? [cursor, maxId] : [visitCursor, cursor, maxId],
    );
    if (!result.rows.length) break;
    const lines = result.rows.map(row => {
      const common = `[${row.created_at.toISOString()}] device=${row.device_id}`;
      return "message" in row
        ? `${common} username=${logField(row.username)} message=${logField(row.message)}`
        : `${common} current_username=${row.username === null ? "null" : logField(row.username)} address=${logField(row.address)}`;
    });
    const last = result.rows[result.rows.length - 1];
    cursor = last.id;
    if ("cursor_time" in last) visitCursor = last.cursor_time;
    await write(res, lines.join("\n") + "\n");
  }
  if (!res.destroyed) res.end();
}
