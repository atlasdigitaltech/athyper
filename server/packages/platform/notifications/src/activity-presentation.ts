/** Presentation resolved from authorized records, never from arbitrary message HTML. */
export interface ActivityDestination {
  readonly href: string;
  readonly recordLabel: string;
  readonly actionLabel?: string;
}
export interface ActivityCoordinate {
  readonly entityCode: string;
  readonly recordId: string;
  readonly commentId?: string;
}
export function localActivityHref(
  value: string | undefined,
): string | undefined {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/.test(value)
  )
    return undefined;
  return value;
}
export function activityCommentHref(href: string, commentId: string): string {
  const url = new URL(href, "https://activity.invalid");
  url.searchParams.set("panel", "collaboration");
  url.searchParams.set("collaborationSection", "comments");
  url.searchParams.set("commentId", commentId);
  url.hash = `comment-${commentId}`;
  return url.pathname + url.search + url.hash;
}
/** A request-local cache prevents repeated reads for multiple events about one record. */
export function createActivityDestinationResolver(
  read: (
    coordinate: ActivityCoordinate,
  ) => Promise<ActivityDestination | undefined>,
) {
  const cache = new Map<string, Promise<ActivityDestination | undefined>>();
  return (coordinate: ActivityCoordinate) => {
    const key = JSON.stringify([
      coordinate.entityCode,
      coordinate.recordId,
      coordinate.commentId,
    ]);
    let result = cache.get(key);
    if (!result) {
      result = read(coordinate).then((value) =>
        value && localActivityHref(value.href) ? value : undefined,
      );
      cache.set(key, result);
    }
    return result;
  };
}
