/** Identical record filters for filename browsing and content search. */
export function fileFilterBody(folder: string, category: string) {
  return {
    ...(folder === "__unfiled"
      ? { unfiled: true }
      : folder
        ? { folderId: folder }
        : {}),
    ...(category ? { category } : {}),
  };
}
