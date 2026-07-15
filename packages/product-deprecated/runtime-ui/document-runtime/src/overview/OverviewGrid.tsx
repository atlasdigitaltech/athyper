/**
 * @athyper/document-runtime — Overview Grid
 *
 * Rec 7: Four summary cards in 2×2 grid.
 * Content varies by document type — caller provides cards.
 */
import { type ReactNode } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";

export interface OverviewCard {
  title: string;
  content: ReactNode;
}

export interface OverviewGridProps {
  cards: OverviewCard[];
  className?: string;
}

export function OverviewGrid({ cards, className }: OverviewGridProps) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-2", className)}>
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
          </CardHeader>
          <CardContent>{card.content}</CardContent>
        </Card>
      ))}
    </div>
  );
}
