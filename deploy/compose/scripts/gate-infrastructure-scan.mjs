import { readFileSync } from "node:fs";
const report = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (report.SchemaVersion !== 2 || !Array.isArray(report.Results))
  throw new Error("Missing or invalid Trivy scan results");
const vulnerabilities = report.Results.flatMap(
  (result) => result.Vulnerabilities ?? [],
);
const blocking = vulnerabilities.filter(
  (v) => ["HIGH", "CRITICAL"].includes(v.Severity) && v.FixedVersion,
);
console.log(
  JSON.stringify({
    image: report.ArtifactName,
    total: vulnerabilities.length,
    highCritical: vulnerabilities.filter((v) =>
      ["HIGH", "CRITICAL"].includes(v.Severity),
    ).length,
    fixableHighCritical: blocking.length,
  }),
);
process.exitCode = blocking.length ? 1 : 0;
