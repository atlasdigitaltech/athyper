import { StubPage } from "@/components/stubs/StubPage";

export default function CloneRecordPage() {
    return <StubPage epic={5} title="Clone Record" description="Create a copy of this entity record." route="/app/:entity/:id/clone" />;
}
