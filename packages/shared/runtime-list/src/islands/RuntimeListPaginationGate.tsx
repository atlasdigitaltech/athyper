"use client";

import type React from "react";
import { useRuntimeListSearch } from "./RuntimeListContext";

export function RuntimeListPaginationGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { search, query, lazyList } = useRuntimeListSearch();
  if (lazyList.enabled) return null;
  if (search.enabled && query.trim()) return null;
  return <>{children}</>;
}
