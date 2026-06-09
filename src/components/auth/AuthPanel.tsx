"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  FormEvent,
  InputHTMLAttributes,
  ReactNode,
} from "react";
import {
  createDefaultBrowserCognitoAuthClient,
} from "@/lib/auth/client";
import { sanitizeReturnToPath } from "@/lib/onboarding-gates";
import type {
  AuthResult,
  AuthSignInState,
  PatientAuthAdapter,
} from "@/lib/auth/shared";

export type AuthPanelMode =
  | "reset-password"
  | "sign-in"
  | "sign-out"
  | "sign-up"
  | "verify-email";

export function AuthPanel({
  client,
  mode,
  returnTo,
}: {
  client?: PatientAuthAdapter;
  mode: AuthPanelMode;
  returnTo?: string | null;
}) {
  const defaultClient = useMemo(() => {
    if (client) {
      return { ok: true as const, value: client };
    }
    return createDefaultBrowserCognitoAuthClient();
  }, [client]);

  if (!defaultClient.ok) {
    return (
      <AuthFrame mode={mode}>
        <Notice tone="error">{defaultClient.error.message}</Notice>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame mode={mode}>
      {mode === "sign-up" && <SignUpForm client={defaultClient.value} />}
      {mode === "verify-email" && <VerifyEmailForm client={defaultClient.value} />}
      {mode === "sign-in" && (
        <SignInForm client={defaultClient.value} returnTo={returnTo} />
      )}
      {mode === "reset-password" && <ResetPasswordForm client={defaultClient.value} />}
      {mode === "sign-out" && <SignOutForm client={defaultClient.value} />}
    </AuthFrame>
  );
}

function AuthFrame({
  children,
  mode,
}: {
  children: ReactNode;
  mode: AuthPanelMode;
}) {
  const content = authContent[mode];

  return (
    <section className="mx-auto grid max-w-page gap-10 px-6 py-16 text-ink md:grid-cols-[0.9fr_1fr] md:px-10 md:py-24">
      <div className="max-w-prose">
        <p className="text-eyebrow uppercase text-ash">{content.kicker}</p>
        <h1 className="display-serif mt-4 text-display-md font-light text-balance">
          {content.title}
        </h1>
        <p className="mt-5 max-w-measure text-pretty text-ink/75">
          {content.body}
        </p>
        <p className="mt-6 max-w-measure text-[1rem] text-ink/65">
          Apoth provides the technology platform. Licensed clinicians working
          with MDI handle clinical care decisions.
        </p>
      </div>
      <div className="border border-ash-line bg-cream-warm p-5 sm:p-7">
        {children}
      </div>
    </section>
  );
}

function SignUpForm({ client }: { client: PatientAuthAdapter }) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submitAuthAction({
      setError,
      setLoading,
      onSuccess: () => setStatus("Check your email for the verification code."),
      action: () =>
        client.signUp({
          email: valueFromForm(form, "email"),
          password: valueFromForm(form, "password", { trim: false }),
        }),
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label="Email" name="email" type="email" autoComplete="email" />
      <Field label="Password" name="password" type="password" autoComplete="new-password" />
      <SubmitButton loading={loading}>Create account</SubmitButton>
      <FormStatus status={status} error={error} />
      <SecondaryLink href="/verify-email">Already have a code?</SecondaryLink>
      <SecondaryLink href="/sign-in">Sign in instead</SecondaryLink>
    </form>
  );
}

function VerifyEmailForm({ client }: { client: PatientAuthAdapter }) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submitAuthAction({
      setError,
      setLoading,
      onSuccess: () => setStatus("Email confirmed. You can sign in now."),
      action: () =>
        client.confirmEmail({
          email: valueFromForm(form, "email"),
          code: valueFromForm(form, "code"),
        }),
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label="Email" name="email" type="email" autoComplete="email" />
      <Field label="Verification code" name="code" inputMode="numeric" autoComplete="one-time-code" />
      <SubmitButton loading={loading}>Verify email</SubmitButton>
      <FormStatus status={status} error={error} />
      <SecondaryLink href="/sign-in">Go to sign in</SecondaryLink>
    </form>
  );
}

function SignInForm({
  client,
  returnTo,
}: {
  client: PatientAuthAdapter;
  returnTo?: string | null;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState<AuthSignInState | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submitAuthAction({
      setError,
      setLoading,
      onSuccess: (value) => {
        setChallenge(value);
        setStatus(value.status === "signed_in" ? "Signed in." : "MFA verification required.");
        redirectAfterSignIn(value, returnTo);
      },
      action: () =>
        client.signIn({
          email: valueFromForm(form, "email"),
          password: valueFromForm(form, "password", { trim: false }),
        }),
    });
  }

  async function onMfaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge || challenge.status === "signed_in") {
      return;
    }
    const form = new FormData(event.currentTarget);
    await submitAuthAction({
      setError,
      setLoading,
      onSuccess: (value) => {
        setChallenge(value);
        setStatus(value.status === "signed_in" ? "Signed in." : "MFA verification required.");
        redirectAfterSignIn(value, returnTo);
      },
      action: () =>
        client.completeTotpChallenge({
          challengeId: challenge.challengeId,
          code: valueFromForm(form, "mfaCode"),
        }),
    });
  }

  if (challenge && challenge.status !== "signed_in") {
    return (
      <form key="mfa-challenge" onSubmit={onMfaSubmit} className="space-y-5">
        {challenge.status === "totp_setup_required" && (
          <Notice tone="info">
            Authenticator setup key: <span className="font-mono">{challenge.sharedSecret}</span>
          </Notice>
        )}
        <Field label="Authenticator code" name="mfaCode" inputMode="numeric" autoComplete="one-time-code" />
        <SubmitButton loading={loading}>Verify code</SubmitButton>
        <FormStatus status={status} error={error} />
      </form>
    );
  }

  return (
    <form key="credentials" onSubmit={onSubmit} className="space-y-5">
      <Field label="Email" name="email" type="email" autoComplete="email" />
      <Field label="Password" name="password" type="password" autoComplete="current-password" />
      <SubmitButton loading={loading}>Sign in</SubmitButton>
      <FormStatus status={status} error={error} />
      <SecondaryLink href="/reset-password">Reset password</SecondaryLink>
      <SecondaryLink href="/sign-up">Create an account</SecondaryLink>
    </form>
  );
}

function ResetPasswordForm({ client }: { client: PatientAuthAdapter }) {
  const [codeSent, setCodeSent] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submitAuthAction({
      setError,
      setLoading,
      onSuccess: () => {
        setCodeSent(true);
        setStatus("Reset code sent.");
      },
      action: () =>
        client.requestPasswordReset({
          email: valueFromForm(form, "email"),
        }),
    });
  }

  async function onConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submitAuthAction({
      setError,
      setLoading,
      onSuccess: () => setStatus("Password reset. You can sign in now."),
      action: () =>
        client.confirmPasswordReset({
          email: valueFromForm(form, "email"),
          code: valueFromForm(form, "code"),
          newPassword: valueFromForm(form, "newPassword", { trim: false }),
        }),
    });
  }

  if (codeSent) {
    return (
      <form onSubmit={onConfirm} className="space-y-5">
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field label="Reset code" name="code" inputMode="numeric" autoComplete="one-time-code" />
        <Field label="New password" name="newPassword" type="password" autoComplete="new-password" />
        <SubmitButton loading={loading}>Save password</SubmitButton>
        <FormStatus status={status} error={error} />
        <SecondaryLink href="/sign-in">Return to sign in</SecondaryLink>
      </form>
    );
  }

  return (
    <form onSubmit={onRequest} className="space-y-5">
      <Field label="Email" name="email" type="email" autoComplete="email" />
      <SubmitButton loading={loading}>Send reset code</SubmitButton>
      <FormStatus status={status} error={error} />
      <SecondaryLink href="/sign-in">Return to sign in</SecondaryLink>
    </form>
  );
}

function SignOutForm({ client }: { client: PatientAuthAdapter }) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitAuthAction({
      setError,
      setLoading,
      onSuccess: () => setStatus("Signed out."),
      action: () => client.signOut(),
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <SubmitButton loading={loading}>Sign out</SubmitButton>
      <FormStatus status={status} error={error} />
      <SecondaryLink href="/">Return home</SecondaryLink>
    </form>
  );
}

function Field({
  label,
  name,
  ...props
}: {
  label: string;
  name: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-[1rem] font-medium text-ink" htmlFor={name}>
      <span>{label}</span>
      <input
        {...props}
        id={name}
        name={name}
        required
        className="mt-2 block min-h-12 w-full border border-ash-line bg-cream px-4 py-3 text-[1rem] text-ink transition-colors duration-250 ease-out-quart placeholder:text-ash hover:border-clay focus:border-clay-deep"
      />
    </label>
  );
}

function SubmitButton({
  children,
  loading,
}: {
  children: ReactNode;
  loading: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="min-h-12 w-full bg-clay-deep px-5 py-3 text-[1rem] font-medium text-cream transition-colors duration-250 ease-out-quart hover:bg-clay disabled:cursor-wait disabled:bg-ash"
    >
      {loading ? "Working" : children}
    </button>
  );
}

function FormStatus({
  error,
  status,
}: {
  error: string | null;
  status: string | null;
}) {
  if (error) {
    return <Notice tone="error">{error}</Notice>;
  }
  if (status) {
    return <Notice tone="info">{status}</Notice>;
  }
  return null;
}

function Notice({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "error" | "info";
}) {
  return (
    <p
      className={
        tone === "error"
          ? "border border-clay bg-cream px-4 py-3 text-[1rem] text-clay-deep"
          : "border border-sage bg-cream px-4 py-3 text-[1rem] text-sage-deep"
      }
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </p>
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
    <p className="text-[1rem]">
      <Link className="font-medium text-clay-deep hover:text-clay" href={href}>
        {children}
      </Link>
    </p>
  );
}

async function submitAuthAction<T>({
  action,
  onSuccess,
  setError,
  setLoading,
}: {
  action: () => Promise<AuthResult<T>>;
  onSuccess: (value: T) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
}) {
  setError(null);
  setLoading(true);
  try {
    const result = await action();
    if (result.ok) {
      onSuccess(result.value);
      return;
    }
    setError(result.error.message);
  } finally {
    setLoading(false);
  }
}

function valueFromForm(
  form: FormData,
  name: string,
  options: { trim?: boolean } = {},
) {
  const value = form.get(name);
  if (typeof value !== "string") {
    return "";
  }
  return options.trim === false ? value : value.trim();
}

function redirectAfterSignIn(value: AuthSignInState, returnTo: string | null | undefined) {
  if (value.status !== "signed_in") {
    return;
  }
  if (returnTo === undefined) {
    return;
  }
  const destination = sanitizeReturnToPath(returnTo) ?? "/dashboard";
  globalThis.location?.assign?.(destination);
}

const authContent = {
  "reset-password": {
    kicker: "Account access",
    title: "Reset your password.",
    body: "Use the reset code from Cognito to set a new password for your Apoth account.",
  },
  "sign-in": {
    kicker: "Patient account",
    title: "Sign in to continue.",
    body: "Access your Apoth account before intake, billing, and care workflow steps.",
  },
  "sign-out": {
    kicker: "Account access",
    title: "Sign out securely.",
    body: "End this browser session when you are finished using Apoth.",
  },
  "sign-up": {
    kicker: "Patient account",
    title: "Create your account.",
    body: "Use an email address you control. Clinical intake happens after account setup.",
  },
  "verify-email": {
    kicker: "Patient account",
    title: "Verify your email.",
    body: "Enter the verification code Cognito sent for your Apoth account.",
  },
} satisfies Record<AuthPanelMode, {
  body: string;
  kicker: string;
  title: string;
}>;
