import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const fixtureDir = path.join(root, "tests/fixtures/mdi");
const catalogPath = path.join(root, "docs/external/mdi-event-catalog.md");
const legacyFixturePath = path.join(root, "src/test/fixtures/mdi.ts");

const requiredFixtures = [
  "case-charge-events.json",
  "case-status-events.json",
  "file-order-events.json",
  "maintenance-error.json",
  "message-notification-events.json",
  "patient-workflow-events.json",
  "questionnaire-flow.json",
  "token-error.json",
  "token-success.json",
];

const disallowedFixturePatterns: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._-]+/i,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
  /client_secret/i,
  /example\.com/i,
  /Streeterville|Pharmacy Name|Partner Name|customersupportexample/i,
  /semaglutide|tirzepatide|peptide|symptom|medication|diagnosis|allergy|pregnancy|height|weight|sexual|hair/i,
];

function readFixture(name: string): string {
  return readFileSync(path.join(fixtureDir, name), "utf8");
}

describe("MDI discovery artifacts", () => {
  it("documents launch-critical MDI surfaces and the live sandbox split", () => {
    const catalog = readFileSync(catalogPath, "utf8");

    expect(catalog).toContain("Live sandbox validation has not run");
    expect(catalog).toContain("T-094");
    expect(catalog).toContain("Auth token");
    expect(catalog).toContain("Case lifecycle");
    expect(catalog).toContain("Questionnaire catalog");
    expect(catalog).toContain("Partner charges");
    expect(catalog).toContain("Dashboard workflow");
    expect(catalog).toContain("Questionnaire responses are discarded");
  });

  it("keeps required fixture files available for MDI client and intake work", () => {
    const files = readdirSync(fixtureDir).sort();

    expect(files).toEqual(requiredFixtures);
  });

  it("keeps fixtures sanitized and free of launch-condition answer examples", () => {
    const fixtureContents = [
      ...requiredFixtures.map((name) => [name, readFixture(name)] as const),
      ["src/test/fixtures/mdi.ts", readFileSync(legacyFixturePath, "utf8")] as const,
    ];

    for (const [name, contents] of fixtureContents) {
      for (const pattern of disallowedFixturePatterns) {
        expect(contents, `${name} should not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("covers must-handle case lifecycle event shapes", () => {
    const caseStatusFixture = JSON.parse(readFixture("case-status-events.json")) as {
      events: Array<{ status: string; type: string }>;
    };
    const statuses = new Set(caseStatusFixture.events.map((event) => event.status));
    const types = new Set(caseStatusFixture.events.map((event) => event.type));

    expect(statuses).toEqual(
      new Set([
        "approved",
        "assigned",
        "cancelled",
        "completed",
        "created",
        "processing",
        "support",
        "tagged",
        "waiting",
      ]),
    );
    expect(types).toEqual(
      new Set([
        "case_assigned",
        "case_cancelled",
        "case_completed",
        "case_created",
        "case_clinically_approved",
        "case_processing",
        "case_support",
        "case_tag_added",
        "case_waiting",
      ]),
    );
  });

  it("uses sentinel placeholders for questionnaire metadata and transient responses", () => {
    const questionnaire = readFixture("questionnaire-flow.json");

    expect(questionnaire).toContain("QUESTION_TEXT_SENTINEL");
    expect(questionnaire).toContain("ANSWER_VALUE_SENTINEL");
    expect(questionnaire).toContain("responses_transient_only");
    expect(questionnaire).not.toContain("\"answers\"");

    const legacyFixture = readFileSync(legacyFixturePath, "utf8");

    expect(legacyFixture).toContain("ANSWER_VALUE_SENTINEL");
  });

  it("allows only sentinel token values in token fixtures", () => {
    const tokenSuccess = JSON.parse(readFixture("token-success.json")) as {
      response: { access_token: string };
    };

    expect(tokenSuccess.response.access_token).toBe("ACCESS_TOKEN_SENTINEL");
  });
});
