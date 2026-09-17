"use client";
import * as React from "react";
import { ApplicationFatalError } from "@athyper/platform-shell-app-foundation";

export default function GlobalError({ error }: { readonly error: Error & { digest?: string } }) {
  return <ApplicationFatalError plane="studio" error={error} />;
}
