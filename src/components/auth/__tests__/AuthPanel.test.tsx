import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthPanel } from "../AuthPanel";
import type {
  AuthResult,
  AuthSignInState,
  PatientAuthAdapter,
  PatientAuthSession,
} from "@/lib/auth/shared";

const session: PatientAuthSession = {
  authenticated: true,
  user: {
    cognitoSub: "cognito-sub-0123456789abcdef",
  },
  token: {
    clientId: "2i8kvm8c840gfou4qvlm67u2be",
    expiresAt: "2030-01-01T00:00:00.000Z",
    issuer: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_urOM8PctH",
    tokenUse: "access",
  },
};

describe("AuthPanel", () => {
  it("submits sign-up without clinical fields", async () => {
    const user = userEvent.setup();
    const client = fakeAuthClient();

    render(<AuthPanel mode="sign-up" client={client} />);

    await user.type(screen.getByLabelText("Email"), "patient@example.com");
    await user.type(screen.getByLabelText("Password"), "Password12345");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(client.signUp).toHaveBeenCalledWith({
      email: "patient@example.com",
      password: "Password12345",
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Check your email for the verification code.",
    );
    expect(screen.queryByLabelText(/condition|medication|symptom/i)).toBeNull();
  });

  it("shows password requirements before sign-up submission", () => {
    const client = fakeAuthClient();

    render(<AuthPanel mode="sign-up" client={client} />);

    expect(screen.getByText("Password requirements")).toBeInTheDocument();
    expect(screen.getByText("At least 12 characters")).toBeInTheDocument();
    expect(screen.getByText("One uppercase letter")).toBeInTheDocument();
    expect(screen.getByText("One lowercase letter")).toBeInTheDocument();
    expect(screen.getByText("One number")).toBeInTheDocument();
    expect(screen.queryByLabelText(/condition|medication|symptom|diagnosis/i)).toBeNull();
  });

  it("rejects clearly invalid sign-up passwords before calling Cognito", async () => {
    const user = userEvent.setup();
    const client = fakeAuthClient();

    render(<AuthPanel mode="sign-up" client={client} />);

    await user.type(screen.getByLabelText("Email"), "patient@example.com");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(client.signUp).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Use a password with at least 12 characters, one uppercase letter, one lowercase letter, and one number.",
    );
  });

  it("shows patient-safe sign-up provider errors", async () => {
    const user = userEvent.setup();
    const client = fakeAuthClient({
      signUpResult: {
        ok: false,
        error: {
          code: "username_exists",
          message: "An account with this email already exists. Sign in or verify your email to continue.",
        },
      },
    });

    render(<AuthPanel mode="sign-up" client={client} />);

    await user.type(screen.getByLabelText("Email"), "patient@example.com");
    await user.type(screen.getByLabelText("Password"), "Password12345");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(client.signUp).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "An account with this email already exists. Sign in or verify your email to continue.",
    );
    expect(screen.queryByText(/Cognito|Exception|stack|session|token/i)).toBeNull();
  });

  it("handles first sign-in TOTP setup with opaque challenge state", async () => {
    const user = userEvent.setup();
    const client = fakeAuthClient({
      signInResult: {
        status: "totp_setup_required",
        challengeId: "opaque-challenge-001",
        sharedSecret: "RAW_TOTP_SECRET",
      },
    });

    render(<AuthPanel mode="sign-in" client={client} />);

    await user.type(screen.getByLabelText("Email"), "patient@example.com");
    await user.type(screen.getByLabelText("Password"), "Password12345");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText(/Authenticator setup key:/)).toHaveTextContent(
      "RAW_TOTP_SECRET",
    );
    expect(screen.queryByDisplayValue("patient@example.com")).toBeNull();
    expect(screen.queryByText("opaque-challenge-001")).toBeNull();

    await user.type(screen.getByLabelText("Authenticator code"), "654321");
    await user.click(screen.getByRole("button", { name: "Verify code" }));

    expect(client.completeTotpChallenge).toHaveBeenCalledWith({
      challengeId: "opaque-challenge-001",
      code: "654321",
    });
    expect(screen.getByRole("status")).toHaveTextContent("Signed in.");
    expect(screen.queryByText(/patient@example.com|opaque-challenge-001/)).toBeNull();
  });

  it("preserves password whitespace while trimming account identifiers and codes", async () => {
    const user = userEvent.setup();
    const client = fakeAuthClient();

    render(<AuthPanel mode="sign-in" client={client} />);

    await user.type(screen.getByLabelText("Email"), "patient@example.com ");
    await user.type(screen.getByLabelText("Password"), " Password12345 ");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(client.signIn).toHaveBeenCalledWith({
      email: "patient@example.com",
      password: " Password12345 ",
    });
  });

  it("requests and confirms password reset", async () => {
    const user = userEvent.setup();
    const client = fakeAuthClient();

    render(<AuthPanel mode="reset-password" client={client} />);

    await user.type(screen.getByLabelText("Email"), "patient@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset code" }));
    expect(client.requestPasswordReset).toHaveBeenCalledWith({
      email: "patient@example.com",
    });

    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "patient@example.com");
    await user.type(screen.getByLabelText("Reset code"), " 123456 ");
    await user.type(screen.getByLabelText("New password"), " NewPassword12345 ");
    await user.click(screen.getByRole("button", { name: "Save password" }));

    expect(client.confirmPasswordReset).toHaveBeenCalledWith({
      email: "patient@example.com",
      code: "123456",
      newPassword: " NewPassword12345 ",
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Password reset. You can sign in now.",
    );
  });

  it("signs out through the auth facade", async () => {
    const user = userEvent.setup();
    const client = fakeAuthClient();

    render(<AuthPanel mode="sign-out" client={client} />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(client.signOut).toHaveBeenCalledWith();
    expect(screen.getByRole("status")).toHaveTextContent("Signed out.");
  });
});

function fakeAuthClient(options: {
  signUpResult?: Awaited<ReturnType<PatientAuthAdapter["signUp"]>>;
  signInResult?: AuthSignInState;
} = {}): PatientAuthAdapter {
  return {
    signUp: vi.fn(async () => options.signUpResult ?? ok({ status: "verification_required", destination: "email" } as const)),
    confirmEmail: vi.fn(async () => ok({ status: "email_confirmed" } as const)),
    signIn: vi.fn(async () => ok(options.signInResult ?? { status: "signed_in", session } as const)),
    completeTotpChallenge: vi.fn(async () => ok({ status: "signed_in", session } as const)),
    requestPasswordReset: vi.fn(async () => ok({ status: "password_reset_code_sent", destination: "email" } as const)),
    confirmPasswordReset: vi.fn(async () => ok({ status: "password_reset_confirmed" } as const)),
    signOut: vi.fn(async () => ok({ status: "signed_out" } as const)),
    getServerSession: vi.fn(async () => ok(session)),
  };
}

function ok<T>(value: T): AuthResult<T> {
  return { ok: true, value };
}
