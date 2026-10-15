/**
 * Whether the public site is selling yet.
 *
 * - `live`     — products are purchasable; enrollment CTAs go to /get-started.
 * - `waitlist` — products are presented as coming soon; enrollment entry is
 *                closed and CTAs collect interest instead.
 *
 * Both modes ship in every build. Switching is an environment change
 * (APOTH_LAUNCH_MODE) plus a redeploy, never a code change, so the sellable
 * configuration stays exercised and revertible rather than living on a branch
 * that has to be merged back.
 *
 * The marketing site is a static export, so this is resolved at build time.
 * The value is mirrored to NEXT_PUBLIC_LAUNCH_MODE for client components.
 */
export const launchModes = ["live", "waitlist"] as const;

export type LaunchMode = typeof launchModes[number];

export function isLaunchMode(value: unknown): value is LaunchMode {
  return typeof value === "string" &&
    (launchModes as readonly string[]).includes(value);
}

/**
 * Defaults to `waitlist`. A missing or malformed value must not present
 * products as purchasable: showing "coming soon" when we are in fact selling
 * costs a conversion, the reverse advertises treatment we cannot deliver.
 */
export function resolveLaunchMode(
  env: Record<string, string | undefined>,
): LaunchMode {
  const configured = (
    env.APOTH_LAUNCH_MODE ?? env.NEXT_PUBLIC_LAUNCH_MODE
  )?.trim();
  return isLaunchMode(configured) ? configured : "waitlist";
}

export function launchMode(): LaunchMode {
  // Both are read literally rather than via a variable key: Next inlines
  // process.env.NEXT_PUBLIC_* at build time only for static member access.
  return resolveLaunchMode({
    APOTH_LAUNCH_MODE: process.env.APOTH_LAUNCH_MODE,
    NEXT_PUBLIC_LAUNCH_MODE: process.env.NEXT_PUBLIC_LAUNCH_MODE,
  });
}

export function isWaitlistMode(): boolean {
  return launchMode() === "waitlist";
}
