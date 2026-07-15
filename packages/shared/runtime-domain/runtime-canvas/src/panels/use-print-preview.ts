"use client";

import { useCallback, useState } from "react";

export interface UsePrintPreviewReturn {
  isOpen: boolean;
  openPrint: () => void;
  close: () => void;
}

export function usePrintPreview(): UsePrintPreviewReturn {
  const [isOpen, setIsOpen] = useState(false);

  const openPrint = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return {
    isOpen,
    openPrint,
    close,
  };
}
