import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestMdiWorkflowUrlDynamoDb: vi.fn(),
}));

vi.mock("@/lib/mdi-workflows", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/mdi-workflows")>(),
  requestMdiWorkflowUrlDynamoDb: mocks.requestMdiWorkflowUrlDynamoDb,
}));

describe("dashboard workflow route", () => {
  it.each([
    "internal-post-v1-patient-patients-patient-subscriptions-subscription-id-refill-refill-subscription",
    "admin",
    "exam",
    "unknown",
  ])("fails closed for unsupported workflow %s", async (workflow) => {
    const { GET } = await import("../route");
    const response = await GET(
      new NextRequest(`https://apoth.test/api/dashboard/workflows/${workflow}`),
      { params: Promise.resolve({ workflow }) },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://apoth.test/dashboard?workflow=unavailable",
    );
    expect(mocks.requestMdiWorkflowUrlDynamoDb).not.toHaveBeenCalled();
  });
});
