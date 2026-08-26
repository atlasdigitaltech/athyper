import type { Metadata } from "next";
import { ContentHeader } from "@athyper/platform-shell";

export const metadata: Metadata = { title: "Identity and access" };

export default function IdentityPage() { return <section aria-labelledby="page-title"><ContentHeader title="Identity and access" description="Identity administration capabilities will arrive through governed vertical slices." /></section>; }
