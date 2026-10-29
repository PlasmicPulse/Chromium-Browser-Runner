import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Response } from "express";
import { pool } from "@workspace/db";
import { exportActivity } from "./activity-export";
import { saveChosenName } from "./chat-store";
import { signDeviceId } from "./visitor-activity";

test("chosen names and visit exports preserve consent, isolation and pagination", async () => {
  const client = await pool.connect();
  const originalQuery = pool.query;
  try {
    await client.query("BEGIN");
    // Temp tables isolate this test from all real visitor records.
    await client.query(`
      CREATE TEMP TABLE visitor_devices (
        device_id uuid PRIMARY KEY, username text,
        consent_active boolean NOT NULL, last_seen timestamptz DEFAULT now()
      ) ON COMMIT DROP;
      CREATE TEMP TABLE page_visits (
        id serial PRIMARY KEY, device_id uuid, address text, created_at timestamptz NOT NULL
      ) ON COMMIT DROP;
    `);
    pool.query = client.query.bind(client) as typeof pool.query;
    const a = randomUUID(), b = randomUUID(), unnamed = randomUUID(), revoked = randomUUID();
    await client.query(
      "INSERT INTO visitor_devices (device_id,consent_active) VALUES ($1,true),($2,true),($3,true),($4,false)",
      [a, b, unnamed, revoked],
    );
    assert.deepEqual(await saveChosenName("FirstName", signDeviceId(a)), { username: "FirstName" });
    assert.deepEqual(await saveChosenName("CurrentName", signDeviceId(a)), { username: "CurrentName" });
    assert.deepEqual(await saveChosenName("OtherBrowser", signDeviceId(b)), { username: "OtherBrowser" });
    assert.equal(await saveChosenName("Denied", signDeviceId(revoked)), null);
    assert.equal(await saveChosenName("Denied", null), null);
    await client.query(`
      INSERT INTO page_visits (device_id,address,created_at)
      SELECT $1,'https://example.com/' || n,
        TIMESTAMPTZ '2026-01-01 00:00:00Z' + n * INTERVAL '1 microsecond'
      FROM generate_series(1,505) n
    `, [a]);
    await client.query(`
      INSERT INTO page_visits (device_id,address,created_at)
      VALUES ($1,'https://example.com/other','2026-01-02'),
             ($2,'https://example.com/unnamed','2026-01-03')
    `, [b, unnamed]);
    const chunks: string[] = [];
    const headers: Record<string, string> = {};
    let ended = false;
    const res = {
      destroyed: false,
      status(code: number) { assert.equal(code, 200); },
      setHeader(key: string, value: string) { headers[key] = value; },
      write(text: string) { chunks.push(text); return true; },
      end() { ended = true; },
    } as unknown as Response;
    await exportActivity(res, "visits");
    const output = chunks.join("");
    const lines = output.split("\n").filter(line => line.startsWith("["));
    assert.equal(lines.length, 507);
    assert.equal(new Set(lines).size, 507);
    assert.match(lines[0], /current_username=null address="https:\/\/example.com\/unnamed"/);
    assert.match(lines[1], /current_username="OtherBrowser"/);
    assert.match(lines[2], /current_username="CurrentName" address="https:\/\/example.com\/505"/);
    assert.match(lines.at(-1)!, /address="https:\/\/example.com\/1"/);
    assert.ok(!output.includes("FirstName"));
    assert.equal(headers["Cache-Control"], "private, no-store");
    assert.ok(ended);
  } finally {
    pool.query = originalQuery;
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
