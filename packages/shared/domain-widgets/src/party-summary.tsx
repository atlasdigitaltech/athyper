import { cn } from "@athyper/theme/utils";

export interface PartyData {
  code: string;
  name: string;
  type?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface PartySummaryProps {
  party: PartyData;
  className?: string;
  compact?: boolean;
}

export function PartySummary({ party, className, compact = false }: PartySummaryProps) {
  if (compact) {
    return (
      <span className={cn("text-sm", className)}>
        <span className="font-medium">{party.name}</span>
        <span className="ml-1 text-muted-foreground">({party.code})</span>
      </span>
    );
  }

  return (
    <div className={cn("text-sm", className)}>
      <div className="font-medium">{party.name}</div>
      <div className="text-muted-foreground">{party.code}{party.type && ` · ${party.type}`}</div>
      {party.email && <div className="text-muted-foreground">{party.email}</div>}
      {party.phone && <div className="text-muted-foreground">{party.phone}</div>}
    </div>
  );
}
