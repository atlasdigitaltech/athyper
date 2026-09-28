/** Local-only preview admission. No publication, database or product imports. */
export function localPreviewRoot(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (!env.ATHYPER_LOCAL_PREVIEW_ROOT) return;
  if (
    env.ATHYPER_DOMAIN_SUFFIX !== "dev.athyper.test" ||
    env.ATHYPER_LOCAL_WORKSPACE !== "1" ||
    env.ATHYPER_ENV !== "local"
  )
    throw new Error("LOCAL_PREVIEW_ENVIRONMENT_REJECTED");
  return env.ATHYPER_LOCAL_PREVIEW_ROOT;
}
