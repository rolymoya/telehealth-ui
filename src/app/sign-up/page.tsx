import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { AuthPanel } from "@/components/auth/AuthPanel";

export const metadata: Metadata = {
  title: "Create account · Apoth",
  description: "Create an Apoth patient account with Cognito-backed authentication.",
};

export default function SignUpPage() {
  return (
    <>
      <Nav variant="light" />
      <main id="main">
        <AuthPanel mode="sign-up" />
      </main>
      <Footer />
    </>
  );
}
