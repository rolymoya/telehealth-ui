// actor_id + action reserved so T-044 can write rows without a migration.
import { uuid, timestamp, text } from "drizzle-orm/pg-core";
import { apoth } from "./auth";

export const auditLog = apoth.table("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id"),
  action: text("action"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
