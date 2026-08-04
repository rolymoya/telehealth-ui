"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  isPublicProductCode,
  type PublicProductCode,
} from "@/lib/public-commerce";

type StartState =
  | { status: "checking" }
  | { status: "redirecting"; destination: string }
  | { status: "signed_out" }
  | { status: "unavailable" };

export function GetStartedStartClient({
  fetchImpl = fetch,
  navigate = defaultNavigate,
  productCode,
}: {
  fetchImpl?: typeof fetch;
  navigate?: (destination: string) => void;
  productCode?: PublicProductCode | null;
}) {
  const selectedProduct = productCode ?? productCodeFromLocation();
  const startPath = selectedProduct
    ? `/get-started?product=${encodeURIComponent(selectedProduct)}`
    : "/get-started";
  const intakeHref = selectedProduct
    ? `/intake?product=${encodeURIComponent(selectedProduct)}`
    : "/intake";
  const signInHref = `/sign-in?returnTo=${encodeURIComponent(startPath)}`;
  const startApiHref = selectedProduct
    ? `/api/onboarding/start?product=${encodeURIComponent(selectedProduct)}`
    : "/api/onboarding/start";
  const [state, setState] = useState<StartState>({ status: "checking" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: "checking" });
    void fetchImpl(startApiHref, {
      credentials: "include",
      headers: {
        accept: "application/json",
      },
      method: "GET",
    }).then(async (response) => {
      if (!active) {
        return;
      }
      if (response.status === 401) {
        setState({ status: "signed_out" });
        return;
      }
      const body = await safeJson(response);
      if (!response.ok || typeof body.destination !== "string" || !isSafeStartDestination(body.destination)) {
        setState({ status: "unavailable" });
        return;
      }
      setState({ status: "redirecting", destination: body.destination });
      navigate(body.destination);
    }).catch(() => {
      if (active) {
        setState({ status: "unavailable" });
      }
    });
    return () => {
      active = false;
    };
  }, [attempt, fetchImpl, navigate, startApiHref]);

  function retry() {
    setAttempt((current) => current + 1);
  }

  if (state.status === "signed_out") {
    return <StartLinks intakeHref={intakeHref} signInHref={signInHref} />;
  }

  if (state.status === "unavailable") {
    return (
      <div className="rounded-[26px] border border-black/[0.05] bg-white p-6 shadow-soft sm:p-9">
        <p className="text-eyebrow uppercase text-ash">Start a visit</p>
        <p className="mt-4 text-[1rem] text-ink/72">
          We could not check your visit status. You can still begin with the
          privacy notice and precheck, or try again.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <PrimaryLink href={intakeHref}>Start precheck</PrimaryLink>
          <button
            className="min-h-12 rounded-full border border-black/15 px-5 py-3 text-[1rem] font-semibold text-[#171719] transition-colors hover:bg-black/[0.04]"
            onClick={retry}
            type="button"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[26px] border border-black/[0.05] bg-white p-6 shadow-soft sm:p-9" role="status">
      <p className="text-eyebrow uppercase text-ash">Start a visit</p>
      <p className="mt-4 text-[1rem] text-ink/72">
        {state.status === "redirecting"
          ? "Continuing your visit."
          : "Checking whether you already have a visit in progress."}
      </p>
      <div className="mt-6">
        <SecondaryTextLink href={signInHref}>Already have an account?</SecondaryTextLink>
      </div>
    </div>
  );
}

export function StartLinks({
  intakeHref = "/intake",
  signInHref = "/sign-in?returnTo=%2Fget-started",
}: {
  intakeHref?: string;
  signInHref?: string;
} = {}) {
  return (
    <div className="rounded-[26px] border border-black/[0.05] bg-white p-6 shadow-soft sm:p-9">
      <p className="text-eyebrow uppercase text-ash">Start a visit</p>
      <p className="mt-4 text-[1rem] text-ink/72">
        Begin with the privacy notice and a short precheck. You will create or
        sign in to your account after that step if online intake can continue.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <PrimaryLink href={intakeHref}>Start precheck</PrimaryLink>
        <SecondaryLink href={signInHref}>Sign in</SecondaryLink>
      </div>
    </div>
  );
}

function productCodeFromLocation(): PublicProductCode | null {
  if (typeof globalThis.location === "undefined") {
    return null;
  }
  const value = new URLSearchParams(globalThis.location.search).get("product");
  return isPublicProductCode(value) ? value : null;
}

function PrimaryLink({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) {
  return (
    <a
      className="inline-flex min-h-12 items-center rounded-full bg-[#171719] px-5 py-3 text-[1rem] font-semibold text-white transition-all hover:-translate-y-px hover:bg-[#343437]"
      href={href}
    >
      {children}
    </a>
  );
}

function SecondaryLink({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) {
  return (
    <a
      className="inline-flex min-h-12 items-center rounded-full border border-black/15 bg-white px-5 py-3 text-[1rem] font-semibold text-[#171719] transition-colors hover:bg-black/[0.04]"
      href={href}
    >
      {children}
    </a>
  );
}

function SecondaryTextLink({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) {
  return (
    <a className="font-semibold text-[#315fbf] underline decoration-[#4e80ee]/30 underline-offset-4 hover:text-[#244a99]" href={href}>
      {children}
    </a>
  );
}

async function safeJson(response: Response) {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

function isSafeStartDestination(destination: string) {
  return /^\/(?:onboarding\/consent(?:\?gate=medication)?|intake|portal\/launch|billing|billing\/activate|dashboard)$/.test(destination);
}

function defaultNavigate(destination: string) {
  globalThis.location?.assign?.(destination);
}
