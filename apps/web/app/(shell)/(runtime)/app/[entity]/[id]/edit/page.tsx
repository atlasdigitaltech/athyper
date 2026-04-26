import { redirect } from "next/navigation";

/**
 * /app/[entity]/[id]/edit — permanent redirect to ?mode=edit
 *
 * The edit surface was collapsed into the detail route via a mode flag
 * (spec §5: Edit is a mode of Read, not a separate page). Any bookmarked
 * or linked /edit URLs are transparently redirected.
 */
export default async function AppEntityEditRedirect({
  params,
}: {
  params: Promise<{ entity: string; id: string }>;
}) {
  const { entity, id } = await params;
  redirect(`/app/${entity}/${id}?mode=edit`);
}
