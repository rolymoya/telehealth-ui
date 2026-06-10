"use server";

import { redirect } from "next/navigation";
import { acceptCurrentConsents } from "@/lib/consent-acceptance";

export async function acceptCurrentConsentsAction(formData: FormData) {
  const result = await acceptCurrentConsents({
    acknowledgements: formData,
  });

  if (!result.ok) {
    redirect("/onboarding/consent?error=acceptance_failed");
  }

  redirect(result.value.destination);
}
