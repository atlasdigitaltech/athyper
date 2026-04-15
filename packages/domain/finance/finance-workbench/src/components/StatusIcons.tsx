"use client";

import { CheckCircle, Lock, Minus, Unlock, XCircle } from "lucide-react";

export function CheckIcon({ value }: { value: boolean }) {
  return value
    ? <CheckCircle size={12} className="text-success mx-auto" />
    : <Minus size={12} className="text-muted-foreground/40 mx-auto" />;
}

export function BlockIcon({ blocked }: { blocked: boolean }) {
  return blocked
    ? <Lock size={11} className="text-destructive/70 mx-auto" />
    : <Unlock size={11} className="text-muted-foreground/30 mx-auto" />;
}

export function PostIcon({ allowed }: { allowed: boolean }) {
  return allowed
    ? <CheckCircle size={12} className="text-success mx-auto" />
    : <XCircle size={12} className="text-destructive/70 mx-auto" />;
}
