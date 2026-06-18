import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { AuthPanel } from "@/components/auth/AuthPanel";

export const metadata: Metadata = {
  title: "Reset password · Apoth",
  description: "Reset the password for your Apoth patient account.",
};

export default function ResetPasswordPage() {
  return (
    <>
      <Nav variant="light" />
      <main id="main">
        <AuthPanel mode="reset-password" />
      </main>
      <Footer />
    </>
  );
}
