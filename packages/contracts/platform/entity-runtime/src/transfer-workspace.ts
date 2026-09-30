/** Registered transfer workspaces. A plane without a workspace publishes no links. */
export const entityTransferWorkspaces: Readonly<
  Partial<Record<"neon" | "mesh" | "studio", string>>
> = Object.freeze({
  neon: "/operations/data-transfers",
  mesh: "/operations/data-transfers",
});
