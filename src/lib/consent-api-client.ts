export async function postConsentAcceptance(input: {
  acknowledgements: Record<string, string>;
  gate: string;
}) {
  return fetch("/api/onboarding/consent", {
    body: JSON.stringify(input),
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}
