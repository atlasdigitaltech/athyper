/** Display only: crosswalk evidence never changes the selected classification. */
export function CrosswalkEvidence({ items }: { readonly items: unknown }) {
  const rows = Array.isArray(items)
    ? items.filter(
        (row): row is Record<string, unknown> =>
          !!row &&
          typeof row === "object" &&
          row.readOnly === true &&
          [
            "id",
            "sourceDomainCode",
            "sourceCode",
            "targetDomainCode",
            "targetCode",
            "mappingType",
            "provenance",
          ].every((key) => typeof row[key] === "string"),
      )
    : [];
  if (!rows.length) return null;
  return (
    <section aria-label="Crosswalk reference evidence">
      <h3>Crosswalk reference evidence</h3>
      <p>Reference only. The selected classification is unchanged.</p>
      <ul>
        {rows.map((row) => (
          <li key={String(row.id)}>
            {String(row.sourceDomainCode)}:{String(row.sourceCode)} →{" "}
            {String(row.targetDomainCode)}:{String(row.targetCode)}
            {typeof row.targetName === "string" ? ` — ${row.targetName}` : ""}
            {` · ${row.mappingType} · ${row.provenance}`}
            {typeof row.confidence === "number"
              ? ` · confidence ${row.confidence}`
              : ""}
            {row.verified === true ? " · Verified" : " · Unverified"}
          </li>
        ))}
      </ul>
    </section>
  );
}
