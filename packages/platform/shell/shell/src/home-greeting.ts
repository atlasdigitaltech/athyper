/** Returns a user-facing greeting in the selected IANA time zone. */
export function dayPeriodGreeting(date: Date, timeZone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone,
    }).format(date),
  );
  return hour >= 5 && hour < 12
    ? "Good morning"
    : hour >= 12 && hour < 18
      ? "Good afternoon"
      : "Good evening";
}
