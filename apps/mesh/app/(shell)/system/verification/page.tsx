import { SystemVerificationPage } from "@athyper/platform-verification";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "System verification" };
export default function VerificationPage() { return <SystemVerificationPage plane="mesh"/>; }
