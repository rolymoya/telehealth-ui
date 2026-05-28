import { uuid, timestamp } from "drizzle-orm/pg-core";
import { apoth } from "./auth";

export const consents = apoth.table("consents", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const consentDocuments = apoth.table("consent_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
