"use client";

import { useEffect, useState } from "react";
import { PatientDashboard } from "@/components/product/PatientDashboard";
import type { PatientDashboardViewModel } from "@/lib/patient-dashboard";

export function PatientDashboardClient({
  initialDashboard,
}: {
  initialDashboard: PatientDashboardViewModel;
}) {
  const [dashboard, setDashboard] = useState(initialDashboard);

  useEffect(() => {
    let cancelled = false;

    async function refreshDashboard() {
      try {
        const response = await fetch("/api/dashboard", {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          return;
        }
        const nextDashboard = await response.json() as PatientDashboardViewModel;
        if (!cancelled) {
          setDashboard(nextDashboard);
        }
      } catch {
        // Keep the safe initial dashboard state when status refresh is unavailable.
      }
    }

    void refreshDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  return <PatientDashboard dashboard={dashboard} />;
}
