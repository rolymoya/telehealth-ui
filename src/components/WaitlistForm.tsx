"use client";

import { ArrowRight } from "lucide-react";
import { useState, type FormEvent } from "react";

import styles from "./WaitlistForm.module.css";

type WaitlistFormProps = {
  /** Opaque product code recorded with the signup. Never a condition name. */
  product: string;
  heading: string;
  body: string;
};

type Status = "idle" | "submitting" | "done" | "error";

/**
 * Collects an email address and nothing else.
 *
 * Deliberately no name, phone, date of birth, state, or any clinical question:
 * an address plus a product code is not health information, which keeps this
 * form outside PHI handling entirely. That boundary is the reason the markup
 * has no other fields, so do not add them without a compliance decision.
 */
export function WaitlistForm({ product, heading, body }: WaitlistFormProps) {
  const endpoint = process.env.NEXT_PUBLIC_WAITLIST_ENDPOINT?.trim();
  const [status, setStatus] = useState<Status>("idle");
  const [email, setEmail] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!endpoint || status === "submitting") return;

    setStatus("submitting");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, product }),
      });
      setStatus(response.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className={styles.panel} id="waitlist">
      <h2 className={styles.heading}>{heading}</h2>
      <p className={styles.body}>{body}</p>

      {status === "done"
        ? (
          <p aria-live="polite" className={styles.done}>
            Thanks. We will email you once this treatment is available.
          </p>
        )
        : (
          <form className={styles.form} onSubmit={onSubmit}>
            <label className={styles.label} htmlFor={`waitlist-email-${product}`}>
              Email address
            </label>
            <div className={styles.row}>
              <input
                autoComplete="email"
                className={styles.input}
                id={`waitlist-email-${product}`}
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                type="email"
                value={email}
              />
              <button
                className={styles.submit}
                disabled={!endpoint || status === "submitting"}
                type="submit"
              >
                {status === "submitting" ? "Joining…" : "Join the waitlist"}
                <ArrowRight aria-hidden="true" />
              </button>
            </div>

            {/* Fails closed: with no endpoint configured the form cannot
                silently discard signups, which would be worse than not
                offering it. */}
            {!endpoint
              ? (
                <p className={styles.note}>
                  <span className="font-mono uppercase tracking-eyebrow text-[0.72rem] text-clay-deep">
                    TODO: waitlist endpoint
                  </span>{" "}
                  Signups are not being collected yet. Set
                  NEXT_PUBLIC_WAITLIST_ENDPOINT to enable this form.
                </p>
              )
              : (
                <p className={styles.note}>
                  We will only use this address to tell you when this treatment
                  becomes available. No health information is collected here.
                </p>
              )}

            {status === "error"
              ? (
                <p aria-live="polite" className={styles.error} role="alert">
                  That did not go through. Please try again.
                </p>
              )
              : null}
          </form>
        )}
    </section>
  );
}
