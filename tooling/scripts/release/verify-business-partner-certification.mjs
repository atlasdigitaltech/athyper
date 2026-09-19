#!/usr/bin/env node
import { verifyBusinessPartnerCertification } from "../../../deploy/stackctl/src/business-partner-certification.mjs";
import { defaultRepoRoot } from "../../../deploy/stackctl/src/io.mjs";

const report = verifyBusinessPartnerCertification(defaultRepoRoot);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "certified") process.exitCode = 2;
