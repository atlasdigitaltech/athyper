import { redirect } from "next/navigation";
import { getNeonServerSession } from "@/lib/server/session";
import { DocumentRenderingWorkbench } from "./DocumentRenderingWorkbench";

export default async function DocumentRenderingPage() {
  if (!await getNeonServerSession()) {
    redirect("/login?next=/workbench/document-rendering");
  }
  return <DocumentRenderingWorkbench />;
}
