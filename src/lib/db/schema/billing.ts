import { uuid, timestamp } from "drizzle-orm/pg-core";
import { apoth } from "./auth";

export const billingEvents = apoth.table("billing_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
