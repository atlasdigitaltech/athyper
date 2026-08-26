import type { Metadata } from "next";
import { ContentHeader } from "@athyper/platform-shell";

export const metadata: Metadata = { title: "Order intake" };

export default function OrdersPage() { return <section aria-labelledby="page-title"><ContentHeader title="Order Intake" description="Order exchange capabilities will arrive through governed vertical slices." /></section>; }
