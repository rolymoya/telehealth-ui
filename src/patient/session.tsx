import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { PatientDashboardViewModel } from "@/lib/patient-dashboard";
import { apiJson } from "./api";

type GuardState =
  | { status: "checking" }
  | { status: "authenticated" }
  | { status: "signed_out" }
  | { status: "unavailable" };

export function RequirePatientSession({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [state, setState] = useState<GuardState>({ status: "checking" });

  useEffect(() => {
    let active = true;
    setState({ status: "checking" });
    void apiJson<PatientDashboardViewModel>("/api/dashboard", {
      cache: "no-store",
    }).then((result) => {
      if (!active) {
        return;
      }
      if (result.ok) {
        setState({ status: "authenticated" });
        return;
      }
      setState(result.response?.status === 401
        ? { status: "signed_out" }
        : { status: "unavailable" });
    });
    return () => {
      active = false;
    };
  }, [location.pathname]);

  if (state.status === "signed_out") {
    return (
      <Navigate
        replace
        to={`/sign-in?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
      />
    );
  }

  if (state.status === "checking") {
    return (
      <main className="px-6 py-16 text-ink md:px-10" role="status">
        <p className="text-eyebrow uppercase text-ash">Patient session</p>
        <p className="mt-4 text-[1rem] text-ink/72">Checking your account session.</p>
      </main>
    );
  }

  return <>{children}</>;
}
