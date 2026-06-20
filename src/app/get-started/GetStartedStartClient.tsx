"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

type StartState =
  | { status: "checking" }
  | { status: "redirecting"; destination: string }
  | { status: "signed_out" }
  | { status: "unavailable" };

const signUpHref = "/sign-up?returnTo=%2Fget-started";
const signInHref = "/sign-in?returnTo=%2Fget-started";

export function GetStartedStartClient({
  fetchImpl = fetch,
  navigate = defaultNavigate,
}: {
  fetchImpl?: typeof fetch;
  navigate?: (destination: string) => void;
}) {
  const [state, setState] = useState<StartState>({ status: "checking" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: "checking" });
    void fetchImpl("/api/onboarding/start", {
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
  }, [attempt, fetchImpl, navigate]);

  function retry() {
    setAttempt((current) => current + 1);
  }

  if (state.status === "signed_out") {
    return <StartLinks />;
  }

  if (state.status === "unavailable") {
    return (
      <div className="border border-ash-line bg-cream-warm p-5 sm:p-7">
        <p className="text-eyebrow uppercase text-ash">Start a visit</p>
        <p className="mt-4 text-[1rem] text-ink/72">
          We could not check your account status. You can start by creating an account, or try again.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <PrimaryLink href={signUpHref}>Create account</PrimaryLink>
          <button
            className="border border-clay-deep px-5 py-3 text-[1rem] font-medium text-clay-deep transition-colors hover:border-clay hover:text-clay"
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
    <div className="border border-ash-line bg-cream-warm p-5 sm:p-7" role="status">
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

export function StartLinks() {
  return (
    <div className="border border-ash-line bg-cream-warm p-5 sm:p-7">
      <p className="text-eyebrow uppercase text-ash">Start a visit</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <PrimaryLink href={signUpHref}>Create account</PrimaryLink>
        <SecondaryLink href={signInHref}>Sign in</SecondaryLink>
      </div>
    </div>
  );
}

function PrimaryLink({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) {
  return (
    <Link
      className="bg-clay-deep px-5 py-3 text-[1rem] font-medium text-cream transition-colors hover:bg-clay"
      href={href}
    >
      {children}
    </Link>
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
    <Link
      className="border border-clay-deep px-5 py-3 text-[1rem] font-medium text-clay-deep transition-colors hover:border-clay hover:text-clay"
      href={href}
    >
      {children}
    </Link>
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
    <Link className="font-medium text-clay-deep hover:text-clay" href={href}>
      {children}
    </Link>
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
  return /^\/(?:onboarding\/consent|intake|onboarding\/mdi|billing)$/.test(destination);
}

function defaultNavigate(destination: string) {
  globalThis.location?.assign?.(destination);
}
