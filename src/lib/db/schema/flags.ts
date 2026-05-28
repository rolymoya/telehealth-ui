import { uuid, timestamp } from "drizzle-orm/pg-core";
import { apoth } from "./auth";

export const featureFlags = apoth.table("feature_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
