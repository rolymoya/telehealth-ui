import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import GetStartedPage from "@/app/get-started/page";

describe("get started page", () => {
  it("renders as a static shell with an intake fallback link", () => {
    render(<GetStartedPage />);

    expect(screen.getByRole("heading", { name: "Continue to intake." }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue" }))
      .toHaveAttribute("href", "/intake");
  });
});
