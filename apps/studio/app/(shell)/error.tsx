"use client";
import * as React from "react";
import { ApplicationError } from "@athyper/platform-shell-app-foundation";

export default function ErrorBoundary(props: {
  readonly error: Error & { digest?: string };
  readonly retry?: () => void;
}) {
  return <ApplicationError plane="studio" {...props} content />;
}
