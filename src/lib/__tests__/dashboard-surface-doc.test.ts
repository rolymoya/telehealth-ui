import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("dashboard launch surface matrix", () => {
  it("documents required launch dashboard capabilities with implementation owners and PHI boundaries", () => {
    const matrix = readFileSync(
      join(process.cwd(), "docs/dashboard/launch-surface-matrix.md"),
      "utf8",
    );

    for (const heading of [
      "Launch ownership",
      "Source event or endpoint family",
      "Approved MDI route or decision",
      "Native patient status/action code",
      "Allowed local persistence",
      "Forbidden local persistence",
      "Embedded workflow mode",
      "Fallback/deferred behavior",
      "Downstream owner",
    ]) {
      expect(matrix).toContain(heading);
    }

    for (const capability of [
      "Case status",
      "Action-needed prompts",
      "Messaging",
      "File and lab access",
      "Clinician workflow",
      "Refills and follow-up care",
      "Voucher, offering, and order cues",
      "Billing",
      "Account and profile basics",
      "Support",
    ]) {
      expect(matrix).toContain(`| ${capability} |`);
    }

    for (const owner of ["T-060", "T-061", "T-062", "T-063"]) {
      expect(matrix).toContain(owner);
    }

    expect(matrix).not.toContain("T-083");
  });

  it("keeps clinical content in MDI and requires safe embedded workflow links", () => {
    const matrix = readFileSync(
      join(process.cwd(), "docs/dashboard/launch-surface-matrix.md"),
      "utf8",
    );
    const normalizedMatrix = matrix.replace(/\s+/g, " ");

    for (const requiredBoundary of [
      "message bodies",
      "clinical notes",
      "questionnaire answers",
      "prescription details",
      "Full embedded URLs and tokens must never be persisted",
      "short-lived user-scoped links",
      "iframe embedding remains deferred",
      "deferred until route validated",
    ]) {
      expect(matrix).toContain(requiredBoundary);
    }

    expect(normalizedMatrix).toContain(
      "Do not render clinical messages, files, labs, prescriptions, or questionnaire answers natively.",
    );
  });

  it("anchors approved embedded workflows to generated MDI operation slugs or explicit deferrals", () => {
    const matrix = readFileSync(
      join(process.cwd(), "docs/dashboard/launch-surface-matrix.md"),
      "utf8",
    );
    const endpointIndex = readMdiEndpointIndex();

    for (const operationSlug of [
      "partner-get-partner-patients-patient-id-auth-get-messaging-app-url",
      "partner-get-partner-patients-patient-id-file-url-get-file-request-url",
      "partner-get-partner-patients-patient-id-intro-video-get-intro-video-request-url",
    ]) {
      expect(matrix).toContain(operationSlug);
      expect(endpointIndex.get(operationSlug)).toMatchObject({
        slug: operationSlug,
        surface: "partner",
      });
    }

    for (const deferredDecision of [
      "exam, driver-license, and preferred-pharmacy routes deferred until route validated",
      "No embedded refill route approved for launch",
      "No embedded route approved; cue/status handling only",
    ]) {
      expect(matrix).toContain(deferredDecision);
    }
  });

  it("documents T-061 refill default-deny and follow-up care launch posture", () => {
    const matrix = readFileSync(
      join(process.cwd(), "docs/dashboard/launch-surface-matrix.md"),
      "utf8",
    );
    const careWorkflow = readFileSync(
      join(process.cwd(), "docs/dashboard/mdi-care-workflow-launch.md"),
      "utf8",
    );
    const normalizedCareWorkflow = careWorkflow.replace(/\s+/g, " ");
    const endpointIndex = readMdiEndpointIndex();
    const refillSlug =
      "internal-post-v1-patient-patients-patient-subscriptions-subscription-id-refill-refill-subscription";

    expect(endpointIndex.get(refillSlug)).toMatchObject({
      slug: refillSlug,
      surface: "internal",
    });
    expect(matrix).toContain(refillSlug);
    expect(matrix).toContain("internal/default-deny");
    expect(careWorkflow).toContain(refillSlug);
    expect(normalizedCareWorkflow).toContain("not approved for launch implementation");
    expect(careWorkflow).toContain("approved messaging workflow");
    expect(normalizedCareWorkflow).toContain("must not promise native Apoth refill submission");
  });
});

function readMdiEndpointIndex() {
  const index = readFileSync(
    join(process.cwd(), "docs/external/mdi/endpoint-index.jsonl"),
    "utf8",
  );

  return new Map(
    index
      .trim()
      .split("\n")
      .map((line) => {
        const entry = JSON.parse(line) as { slug: string; surface: string };
        return [entry.slug, entry] as const;
      }),
  );
}
