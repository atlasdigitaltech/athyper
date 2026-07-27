"use client";

import { useEffect, useState } from "react";

const VISIBLE_DELAY_MS = 300;
const LONG_WAIT_DELAY_MS = 5_000;

export function DelayedLoadingMessage({
  label,
  longWaitLabel,
}: {
  label: string;
  longWaitLabel: string;
}) {
  const [visible, setVisible] = useState(false);
  const [longWait, setLongWait] = useState(false);

  useEffect(() => {
    const visibleTimer = window.setTimeout(() => setVisible(true), VISIBLE_DELAY_MS);
    const longWaitTimer = window.setTimeout(() => setLongWait(true), LONG_WAIT_DELAY_MS);
    return () => {
      window.clearTimeout(visibleTimer);
      window.clearTimeout(longWaitTimer);
    };
  }, []);

  return (
    <p
      role="status"
      aria-live="polite"
      className={visible ? "text-xs text-muted-foreground" : "sr-only"}
    >
      {longWait ? longWaitLabel : label}
    </p>
  );
}
