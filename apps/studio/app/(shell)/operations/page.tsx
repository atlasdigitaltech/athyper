import type { Metadata } from "next";
import { OperationsHub } from "./operations-hub";

export const metadata: Metadata = { title: "Operations" };

export default function OperationsPage() {
  return <OperationsHub />;
}
