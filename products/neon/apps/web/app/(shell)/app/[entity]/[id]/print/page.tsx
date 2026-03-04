import { StubPage } from "@/components/stubs/StubPage";

export default function PrintViewPage() {
    return <StubPage epic={6} title="Print View" description="Print-optimized view of this record." route="/app/:entity/:id/print" />;
}
