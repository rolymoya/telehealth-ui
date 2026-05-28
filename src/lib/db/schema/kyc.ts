import { uuid, timestamp } from "drizzle-orm/pg-core";
import { apoth } from "./auth";

export const kycVerifications = apoth.table("kyc_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
