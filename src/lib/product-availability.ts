import { launchMode } from "@/lib/launch-mode";
import { onboardingHref } from "@/lib/public-commerce";

/**
 * What a marketing surface should offer for a product, so pages ask one
 * question rather than each deciding for itself what "coming soon" looks like.
 */
export type ProductOffer =
  | {
      status: "available";
      /** Enrollment entry point. */
      href: string;
      ctaLabel: string;
    }
  | {
      status: "coming-soon";
      /** Waitlist anchor on the product page, not an enrollment route. */
      href: string;
      ctaLabel: string;
    };

const waitlistAnchor = "#waitlist";

/**
 * NAD+ has never been purchasable, so it is coming soon in either mode. Weight
 * follows the launch mode.
 */
export function weightOffer(
  /**
   * Page-specific call to action for live mode. The weight-loss page says
   * "Start the $0 precheck" where the site-wide default is broader; in
   * waitlist mode every surface says the same thing, so this is ignored.
   */
  options?: { liveCtaLabel?: string },
): ProductOffer {
  if (launchMode() === "waitlist") {
    return {
      status: "coming-soon",
      href: waitlistAnchor,
      ctaLabel: "Join the waitlist",
    };
  }
  return {
    status: "available",
    href: onboardingHref("weight"),
    ctaLabel: options?.liveCtaLabel ?? "See if online care fits",
  };
}

export function nadOffer(): ProductOffer {
  return {
    status: "coming-soon",
    href: waitlistAnchor,
    ctaLabel: "Join the waitlist",
  };
}

/** Availability line for the home care strip. */
export function weightAvailabilityDetail(priceFrom: string): string {
  return weightOffer().status === "available"
    ? `Available now · plans from ${priceFrom}`
    : "Coming soon · join the waitlist";
}
