import type { Metadata } from "next";
import { ContentHeader } from "@athyper/platform-shell";

export const metadata: Metadata = { title: "Inventory" };

export default function InventoryPage() { return <section aria-labelledby="page-title"><ContentHeader title="Inventory" description="Inventory capabilities will arrive through governed vertical slices." /></section>; }
