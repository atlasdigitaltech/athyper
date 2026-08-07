import { cn } from "@athyper/platform-theme/utils";

export interface AddressData {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
}

export interface AddressSummaryProps {
  address: AddressData;
  className?: string;
  compact?: boolean;
}

export function AddressSummary({ address, className, compact = false }: AddressSummaryProps) {
  const lines = [
    address.line1,
    address.line2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(", "),
    address.countryName ?? address.countryCode,
  ].filter(Boolean);

  if (compact) {
    return <span className={cn("text-sm text-muted-foreground", className)}>{lines.join(", ")}</span>;
  }

  return (
    <address className={cn("text-sm not-italic leading-relaxed text-muted-foreground", className)}>
      {lines.map((line, i) => (
        <span key={i}>
          {line}
          {i < lines.length - 1 && <br />}
        </span>
      ))}
    </address>
  );
}
