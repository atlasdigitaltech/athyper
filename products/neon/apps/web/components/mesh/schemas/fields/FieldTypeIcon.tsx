"use client";

import {
  Binary,
  Calendar,
  CircleDot,
  Hash,
  Key,
  Link2,
  List,
  ToggleLeft,
  Type,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const TYPE_ICON_MAP: Record<string, LucideIcon> = {
  string: Type,
  text: Type,
  number: Hash,
  integer: Hash,
  decimal: Hash,
  boolean: ToggleLeft,
  date: Calendar,
  datetime: Calendar,
  timestamp: Calendar,
  uuid: Key,
  reference: Link2,
  enum: List,
  json: Binary,
  jsonb: Binary,
};

interface FieldTypeIconProps {
  dataType: string;
}

export function FieldTypeIcon({ dataType }: FieldTypeIconProps) {
  const Icon = TYPE_ICON_MAP[dataType.toLowerCase()] ?? CircleDot;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Icon className="size-3.5 text-muted-foreground shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">{dataType}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
