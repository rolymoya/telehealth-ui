import type { Metadata } from "next";
import { createUnavailablePatientDashboard } from "@/lib/patient-dashboard";
import { PatientDashboardClient } from "./PatientDashboardClient";

export const metadata: Metadata = {
  title: "Dashboard · Apoth",
  description: "View your Apoth account workflow status.",
};

export default function DashboardPage() {
  return <PatientDashboardClient initialDashboard={createUnavailablePatientDashboard()} />;
}
