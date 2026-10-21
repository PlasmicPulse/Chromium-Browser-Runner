import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const browserProfilesTable = pgTable("browser_profiles", {
  profileKey: text("profile_key").primaryKey(),
  encryptedState: text("encrypted_state").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertBrowserProfileSchema = createInsertSchema(
  browserProfilesTable,
).omit({ updatedAt: true });
export type InsertBrowserProfile = z.infer<typeof insertBrowserProfileSchema>;
export type BrowserProfile = typeof browserProfilesTable.$inferSelect;
