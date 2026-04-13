"use client";

/**
 * GreetingBanner — time-aware personalized greeting on the home dashboard.
 *
 * Shows "Good morning / afternoon / evening, [firstName]!" based on local time.
 */

import { useEffect, useState } from "react";
import { useShellSession } from "@/components/providers/SessionProvider";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getFirstName(displayName: string): string {
  return displayName.split(/\s+/)[0] ?? displayName;
}

export function GreetingBanner() {
  const { bff } = useShellSession();
  // Avoid hydration mismatch — compute greeting client-side only
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    setGreeting(getGreeting());
  }, []);

  if (!greeting) return null;

  const firstName = getFirstName(bff.displayName);
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex items-baseline justify-between">
      <div>
        <h2 className="text-xl font-semibold">
          {greeting}, {firstName}!
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{today}</p>
      </div>
    </div>
  );
}
