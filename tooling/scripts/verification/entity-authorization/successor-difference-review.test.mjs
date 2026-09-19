import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessSuccessorDifferenceReview } from "./successor-difference-review.mjs";
const input = () => ({
  proposal: JSON.parse(
    readFileSync(
      "governance/policy/reviews/business-partner-release-19-differences.successor-20260911.proposal.dev.json",
    ),
  ),
  acceptance: JSON.parse(
    readFileSync(
      "governance/policy/reviews/business-partner-release-19-differences.successor-20260911.acceptance.dev.json",
    ),
  ),
  readEvidence: (path) => readFileSync(path),
});
test("explicit acceptance resolves reviewed dispositions without proving old causes or activating", () => {
  const r = assessSuccessorDifferenceReview(input());
  assert.equal(r.reviewedDispositionGateSatisfied, true);
  assert.equal(r.unresolvedReviewedDispositions, 0);
  assert.equal(r.historicalRows, 29);
  assert.equal(r.currentDifferenceGroups, 37);
  assert.equal(r.historicalCausesRetrospectivelyProven, false);
  assert.equal(r.activationEligible, false);
  assert.equal(r.fullExactReleaseQualification, false);
});
test("changed proposals never inherit acceptance", () => {
  const i = input();
  i.proposal.currentDifferenceProposals[0].explanation += " changed";
  assert.ok(
    assessSuccessorDifferenceReview(i).errors.includes(
      "proposal_revision_changed",
    ),
  );
});
test("changed or missing source and regression evidence invalidate acceptance", () => {
  for (const path of [
    input().proposal.sources[0].path,
    input().proposal.rows[0].regressions[0].path,
  ]) {
    const i = input();
    i.readEvidence = (p) =>
      p === path ? Buffer.from("changed") : readFileSync(p);
    assert.equal(
      assessSuccessorDifferenceReview(i).reviewedDispositionGateSatisfied,
      false,
    );
  }
});
test("omitted, duplicated or changed decisions remain blocked", () => {
  for (const mutate of [
    (a) => a.decisions.pop(),
    (a) => a.decisions.push(a.decisions[0]),
    (a) => (a.decisions[0].disposition = "different"),
  ]) {
    const i = input();
    mutate(i.acceptance);
    assert.equal(
      assessSuccessorDifferenceReview(i).reviewedDispositionGateSatisfied,
      false,
    );
  }
});
test("conversation acceptance cannot masquerade as a named-account receipt or activation", () => {
  for (const mutate of [
    (a) => (a.actor.namedAccountImpersonated = true),
    (a) => (a.activationAuthorized = true),
    (a) => (a.executionParityApproved = true),
    (a) => (a.source.exactMessage = "assumed"),
  ]) {
    const i = input();
    mutate(i.acceptance);
    assert.equal(
      assessSuccessorDifferenceReview(i).reviewedDispositionGateSatisfied,
      false,
    );
  }
});
test("unaccepted proposals remain blocked", () => {
  const i = input();
  i.acceptance = null;
  assert.equal(
    assessSuccessorDifferenceReview(i).reviewedDispositionGateSatisfied,
    false,
  );
});

test("go ahead requires the presented question and exact proposal binding", () => {
  for (const mutate of [
    (a) => delete a.source.respondingTo,
    (a) => (a.source.approvedProposalRevisions = []),
    (a) => (a.source.approvedProposalRevisions = a.proposalRevision),
  ]) {
    const i = input();
    mutate(i.acceptance);
    assert.equal(
      assessSuccessorDifferenceReview(i).reviewedDispositionGateSatisfied,
      false,
    );
  }
});
test("legacy explicit accepted wording remains supported", () => {
  const i = input();
  i.acceptance.source.exactMessage = "accepted";
  assert.equal(
    assessSuccessorDifferenceReview(i).reviewedDispositionGateSatisfied,
    true,
  );
});
