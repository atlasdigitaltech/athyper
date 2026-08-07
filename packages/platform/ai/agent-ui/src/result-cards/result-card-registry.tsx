"use client";

import type {
  AtlasRecordSummaryCard as AtlasRecordSummaryCardValue,
  AtlasResultCard,
  AtlasTextResultCard,
} from "@athyper/platform-ai-agent-runtime";
import { TextCard } from "./text-card";
import { RecordSummaryCard } from "./record-summary-card";
import { UnknownCard } from "./unknown-card";

export function ResultCard({ card }: { card: AtlasResultCard }) {
  switch (card.kind) {
    case "text":
      return "body" in card && typeof card.body === "string"
        ? <TextCard card={card as AtlasTextResultCard} />
        : <UnknownCard />;
    case "record_summary":
      return (
        "version" in card
        && card.version === 1
        && "fields" in card
        && Array.isArray(card.fields)
        && "evidence" in card
        && Array.isArray(card.evidence)
      )
        ? <RecordSummaryCard card={card as AtlasRecordSummaryCardValue} />
        : <UnknownCard />;
    default:
      return <UnknownCard />;
  }
}
