import type { Metadata } from "next";

export const metadata: Metadata = { title: "Procurement" };

export default function ProcurementLayout({ children }: { readonly children: React.ReactNode }) {
  return children;
}
