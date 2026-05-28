import { uuid, timestamp } from "drizzle-orm/pg-core";
import { apoth } from "./auth";

export const userProfiles = apoth.table("user_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
