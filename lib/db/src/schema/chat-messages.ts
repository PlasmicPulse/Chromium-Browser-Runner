import { createInsertSchema } from "drizzle-zod";
import { pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { visitorDevicesTable } from "./visitor-activity";

export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  message: text("message").notNull(),
  deviceId: uuid("device_id").references(() => visitorDevicesTable.deviceId),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertChatMessageSchema = createInsertSchema(chatMessagesTable).omit({ id: true, createdAt: true });
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessagesTable.$inferSelect;
