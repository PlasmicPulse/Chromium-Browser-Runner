import type { Response } from "express";
import { pool } from "@workspace/db";

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
    "Stopping logging prevents future entries; previously recorded entries remain.",
    "",
  ].join("\n") + "\n");
  let cursor = 0;
  while (!res.destroyed && cursor < maxId) {
    const result = await pool.query(
      `SELECT id, device_id, created_at, ${chat ? "username, message" : "address"}
       FROM ${table} WHERE id > $1 AND id <= $2 ${chat ? "AND device_id IS NOT NULL" : ""}
       ORDER BY id LIMIT 500`, [cursor, maxId],
    );
    if (!result.rows.length) break;
    const lines = result.rows.map(row => {
      const common = `[${row.created_at.toISOString()}] device=${row.device_id}`;
      return chat
        ? `${common} username=${logField(row.username)} message=${logField(row.message)}`
        : `${common} address=${logField(row.address)}`;
    });
    cursor = result.rows[result.rows.length - 1].id;
    await write(res, lines.join("\n") + "\n");
  }
  if (!res.destroyed) res.end();
}
