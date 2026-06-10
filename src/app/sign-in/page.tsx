import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { AuthPanel } from "@/components/auth/AuthPanel";

export const metadata: Metadata = {
  title: "Sign in · Apoth",
  description: "Sign in to your Apoth patient account.",
};

export default function SignInPage() {
  return (
    <>
      <Nav variant="light" />
      <main id="main">
        <AuthPanel mode="sign-in" />
      </main>
      <Footer />
    </>
  );
}
