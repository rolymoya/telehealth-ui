import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { AuthPanel } from "@/components/auth/AuthPanel";

export const metadata: Metadata = {
  title: "Verify email · Apoth",
  description: "Verify the email address for your Apoth patient account.",
};

export default function VerifyEmailPage() {
  return (
    <>
      <Nav variant="light" />
      <main id="main">
        <AuthPanel mode="verify-email" />
      </main>
      <Footer />
    </>
  );
}
