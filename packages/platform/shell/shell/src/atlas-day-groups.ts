/** Today, Yesterday, This week, Earlier: the activity feed's grouping. */
export function groupByDay<T>(items: readonly T[], at: (item: T) => string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  const label = (value: string) => {
    const time = new Date(value).getTime();
    if (time >= start.getTime()) return "Today";
    if (time >= start.getTime() - day) return "Yesterday";
    if (time >= start.getTime() - 6 * day) return "This week";
    return "Earlier";
  };
  const groups: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const name = label(at(item));
    const group = groups.find((entry) => entry.label === name);
    if (group) group.items.push(item);
    else groups.push({ label: name, items: [item] });
  }
  return groups;
}
