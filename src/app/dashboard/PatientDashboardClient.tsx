"use client";

import { useEffect, useState } from "react";
import { PatientDashboard } from "@/components/product/PatientDashboard";
import type { BillingCancellationState } from "@/components/product/PatientDashboard";
import type { PatientDashboardViewModel } from "@/lib/patient-dashboard";

export function PatientDashboardClient({
  initialDashboard,
}: {
  initialDashboard: PatientDashboardViewModel;
}) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [cancellationState, setCancellationState] = useState<BillingCancellationState>("idle");

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

  async function refreshDashboard() {
    const response = await fetch("/api/dashboard", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return;
    }
    const nextDashboard = await response.json() as PatientDashboardViewModel;
    setDashboard(nextDashboard);
  }

  async function confirmCancellation() {
    if (cancellationState === "submitting") {
      return;
    }
    setCancellationState("submitting");
    try {
      const response = await fetch("/api/billing/subscription/cancel", {
        cache: "no-store",
        headers: { Accept: "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        setCancellationState("unavailable");
        return;
      }
      setCancellationState("submitted");
      void refreshDashboard().catch(() => {
        // Keep the submitted state if the follow-up dashboard refresh is unavailable.
      });
    } catch {
      setCancellationState("unavailable");
    }
  }

  return (
    <PatientDashboard
      cancellation={{
        onBegin: () => setCancellationState("confirming"),
        onConfirm: confirmCancellation,
        onDismiss: () => setCancellationState("idle"),
        state: cancellationState,
      }}
      dashboard={dashboard}
    />
  );
}
