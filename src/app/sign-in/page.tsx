import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { sanitizeReturnToPath } from "@/lib/onboarding-gates";

export const metadata: Metadata = {
  title: "Sign in · Apoth",
  description: "Sign in to your Apoth patient account.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawReturnTo = Array.isArray(params?.returnTo)
    ? params?.returnTo[0]
    : params?.returnTo;
  const returnTo = sanitizeReturnToPath(rawReturnTo) ?? "/dashboard";

  return (
    <>
      <Nav variant="light" />
      <main id="main">
        <AuthPanel mode="sign-in" returnTo={returnTo} />
      </main>
      <Footer />
    </>
  );
}
