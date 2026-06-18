"use client";

import { useEffect } from "react";

export function GetStartedRedirectClient() {
  useEffect(() => {
    globalThis.location?.replace?.("/intake");
  }, []);

  return null;
}
