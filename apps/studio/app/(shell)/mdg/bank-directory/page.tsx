import type { Metadata } from "next";
import { BankDirectoryWorkspace } from "@athyper/product-studio-business-partner";
export const metadata: Metadata = { title: "Bank Directory" };
export default function BankDirectoryPage() { return <BankDirectoryWorkspace />; }
