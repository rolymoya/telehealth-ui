import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProductRouteState } from "@/components/product/ProductRouteState";

describe("ProductRouteState", () => {
  it("renders a calm product recovery state with safe actions", () => {
    render(
      <ProductRouteState
        eyebrow="Patient account"
        title="We could not open that page."
        body="No medical information was changed. Return to the dashboard or try again."
        actions={[
          { href: "/dashboard", label: "Dashboard" },
          { href: "/", label: "Home", variant: "secondary" },
        ]}
      />,
    );

    expect(screen.getByRole("heading", {
      name: /we could not open that page/i,
    })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" }))
      .toHaveAttribute("href", "/dashboard");
    expect(screen.getByText(/no medical information was changed/i))
      .toBeInTheDocument();
  });

  it("supports retry actions without exposing error details", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();

    render(
      <ProductRouteState
        eyebrow="Recovery"
        title="Try this step again."
        body="The workflow is temporarily unavailable."
        actions={[{ label: "Try again", onClick: retry }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/token|stack|payload/i)).not.toBeInTheDocument();
  });
});
