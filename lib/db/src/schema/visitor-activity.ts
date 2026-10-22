import { createInsertSchema } from "drizzle-zod";
import { boolean, index, pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const visitorDevicesTable = pgTable("visitor_devices", {
  deviceId: uuid("device_id").primaryKey(),
  consentActive: boolean("consent_active").notNull().default(true),
  firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
  browser: text("browser").notNull(),
  platform: text("platform").notNull(),
  username: text("username"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export const pageVisitsTable = pgTable("page_visits", {
  id: serial("id").primaryKey(),
  deviceId: uuid("device_id").notNull().references(() => visitorDevicesTable.deviceId),
  address: text("address").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("page_visits_device_idx").on(table.deviceId)]);

export const insertVisitorDeviceSchema = createInsertSchema(visitorDevicesTable);
export const insertPageVisitSchema = createInsertSchema(pageVisitsTable).omit({ id: true, createdAt: true });
export type InsertVisitorDevice = z.infer<typeof insertVisitorDeviceSchema>;
export type VisitorDevice = typeof visitorDevicesTable.$inferSelect;
export type PageVisit = typeof pageVisitsTable.$inferSelect;
