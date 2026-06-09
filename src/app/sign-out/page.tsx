import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { AuthPanel } from "@/components/auth/AuthPanel";

export const metadata: Metadata = {
  title: "Sign out · Apoth",
  description: "Sign out of your Apoth patient account.",
};

export default function SignOutPage() {
  return (
    <>
      <Nav variant="light" />
      <main id="main">
        <AuthPanel mode="sign-out" />
      </main>
      <Footer />
    </>
  );
}
