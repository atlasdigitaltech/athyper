"use client";
import { useEffect, useState } from "react";
import { SegmentedControl } from "@athyper/platform-ui";
import {
  createOperation,
  encodePathSegment,
} from "@athyper/platform-api-client";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
interface LearningAttempt {
  id: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  failureCode?: string;
  evidence?: { fixtureCount?: number; passedCount?: number };
}
interface LearningItem {
  attemptCount?: number;
  attempts?: LearningAttempt[];
  id: string;
  revision: number;
  state: string;
  phrase: string;
  capabilityId: string;
  entityCode: string;
  originPlane: string;
  sourceDescriptorHash: string;
  proposalHash: string;
  changeSetId?: string;
  changeSetStatus?: string;
  changeSetRevision?: number;
  releaseId?: string;
  publicationStatus?: string;
  deployments?: readonly { plane: string; state: string }[];
  evaluation?: {
    passed: boolean;
    fixtureHash: string;
    results: readonly { expected: string; actual: string; passed: boolean }[];
  };
}
const list = createOperation<{ items: LearningItem[] }>({
  method: "GET",
  path: "/api/studio/atlas-learning",
});
const action = createOperation<unknown, Record<string, unknown>>({
  method: "POST",
  path: ({ id, action }) =>
    `/api/studio/atlas-learning/${encodePathSegment(String(id))}/${encodePathSegment(String(action))}`,
  idempotency: "required",
});
export function AtlasLearningInboxWorkspace() {
  const client = useApiClient();
  const [items, setItems] = useState<LearningItem[]>([]),
    [status, setStatus] = useState("Loading corrections…");
  const reload = async () => {
    try {
      const result = await client.request(list);
      setItems(result.items);
      setStatus(result.items.length ? "" : "No corrections awaiting review.");
    } catch {
      setStatus("The learning inbox is unavailable with your current access.");
    }
  };
  useEffect(() => {
    void reload();
  }, [client]);
  const run = async (
    item: LearningItem,
    name: string,
    body: Record<string, unknown>,
  ) => {
    await client.request(action, {
      params: { id: item.id, action: name },
      body,
      idempotencyKey: crypto.randomUUID(),
    });
    await reload();
  };
  return (
    <section aria-label="Atlas learning inbox">
      <p>
        Review short terms proposed from Atlas responses. Test new wording,
        create a draft, then use independent approval and publication to make it
        available.
      </p>
      <button type="button" onClick={() => void reload()}>
        Refresh inbox
      </button>
      <p role="status">{status}</p>
      {items.map((item) => (
        <AtlasLearningReviewCard key={item.id} item={item} run={run} />
      ))}
    </section>
  );
}
export function AtlasLearningReviewCard({
  item,
  run,
}: {
  item: LearningItem;
  run: (
    item: LearningItem,
    action: string,
    body: Record<string, unknown>,
  ) => Promise<void>;
}) {
  const [first, setFirst] = useState(""),
    [second, setSecond] = useState(""),
    [negative, setNegative] = useState("");
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const [fixtureMode, setFixtureMode] = useState<"reviewer" | "published">(
      "reviewer",
    ),
    [fixtureSetId, setFixtureSetId] = useState("");
  const perform = async (name: string, body: Record<string, unknown>) => {
    setBusy(true);
    setStatus("");
    try {
      await run(item, name, body);
      setStatus(
        name === "stage"
          ? "Evaluation passed. The correction is in a draft."
          : name === "publish"
            ? "Release queued. Delivery and activation are tracked separately."
            : "Workflow updated.",
      );
    } catch {
      setStatus(
        "The action could not complete. Refresh to check the current state. Review requires a different person; test questions and source definitions must still be valid.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <article aria-label={`Correction: ${item.phrase}`}>
      <h2>{item.phrase}</h2>
      <p>
        {item.entityCode} · {item.originPlane} · Record summary
      </p>
      <p>
        Status: {item.changeSetStatus ?? item.state}
        {item.publicationStatus
          ? ` · Publication ${item.publicationStatus}`
          : ""}
      </p>
      <fieldset disabled={busy}>
        {item.state === "pending" ||
        (item.state === "drafted" && !item.releaseId) ? (
          <>
            <SegmentedControl
              label="Evaluation questions"
              value={fixtureMode}
              onValueChange={setFixtureMode}
              disabled={busy}
              options={[
                { value: "reviewer", label: "Reviewer-submitted questions" },
                {
                  value: "published",
                  label: "Independently approved published questions",
                },
              ]}
            />
            {fixtureMode === "published" ? (
              <label>
                Published fixture reference{" "}
                <input
                  value={fixtureSetId}
                  onChange={(event) => setFixtureSetId(event.target.value)}
                  placeholder="Release UUID/test key"
                />
                <span>
                  Use an independently approved Entity release containing a
                  fixture declaration for this entity and plane.
                </span>
              </label>
            ) : (
              <>
                <p>
                  Write a question the new term should fix, an existing
                  record-summary question that must still work, and a question
                  that should stay with the agent, such as an edit request.
                  These review questions are never added to vocabulary.
                </p>
                <label>
                  Correction question{" "}
                  <input
                    maxLength={240}
                    value={first}
                    onChange={(event) => setFirst(event.target.value)}
                  />
                </label>
                <label>
                  Preservation question{" "}
                  <input
                    maxLength={240}
                    value={second}
                    onChange={(event) => setSecond(event.target.value)}
                  />
                </label>
                <label>
                  Safety question{" "}
                  <input
                    maxLength={240}
                    value={negative}
                    onChange={(event) => setNegative(event.target.value)}
                  />
                </label>
              </>
            )}
            <button
              type="button"
              disabled={
                fixtureMode === "published"
                  ? !fixtureSetId.trim()
                  : !first.trim() || !second.trim() || !negative.trim()
              }
              onClick={() =>
                void perform("stage", {
                  revision: item.revision,
                  ...(item.state === "drafted" ? { requalify: true } : {}),
                  ...(fixtureMode === "published"
                    ? { fixtureSetId: fixtureSetId.trim() }
                    : {
                        fixtures: [
                          {
                            question: first,
                            expected: "read",
                            purpose: "correction",
                          },
                          {
                            question: second,
                            expected: "read",
                            purpose: "preservation",
                          },
                          {
                            question: negative,
                            expected: "delegate",
                            purpose: "safety",
                          },
                        ],
                      }),
                })
              }
            >
              {item.state === "drafted"
                ? "Re-evaluate into a new draft"
                : "Evaluate and create draft"}
            </button>
            {item.state === "pending" ? (
              <button
                type="button"
                onClick={() =>
                  void perform("reject", { revision: item.revision })
                }
              >
                Reject correction
              </button>
            ) : (
              <p>
                Re-evaluation creates a new draft that requires fresh submission
                and independent approval.
              </p>
            )}
          </>
        ) : null}
        {item.changeSetStatus === "draft" ? (
          <button
            type="button"
            onClick={() =>
              void perform("submit", {
                expectedRevision: item.changeSetRevision,
              })
            }
          >
            Submit draft for approval
          </button>
        ) : null}
        {item.changeSetStatus === "in_review" ? (
          <button
            type="button"
            onClick={() =>
              void perform("approve", {
                expectedRevision: item.changeSetRevision,
              })
            }
          >
            Approve draft
          </button>
        ) : null}
        {item.changeSetStatus === "approved" ? (
          <button
            type="button"
            onClick={() =>
              void perform("publish", {
                expectedRevision: item.changeSetRevision,
              })
            }
          >
            Publish to {item.originPlane}
          </button>
        ) : null}
        {item.releaseId && item.publicationStatus === "approved" ? (
          <button type="button" onClick={() => void perform("resume", {})}>
            Retry delivery
          </button>
        ) : null}
      </fieldset>
      {item.evaluation ? (
        <p>
          Evaluation:{" "}
          {item.evaluation.results.filter((result) => result.passed).length}/
          {item.evaluation.results.length} questions passed.
        </p>
      ) : null}
      {item.deployments?.map((deployment, index) => (
        <p key={index}>
          {deployment.plane}: {deployment.state}
        </p>
      ))}
      {item.attemptCount ? (
        <details>
          <summary>Evaluation attempts ({item.attemptCount})</summary>
          <p>
            Latest {item.attempts?.length ?? 0} attempts. Started means no
            terminal result was recorded.
          </p>
          <ol>
            {item.attempts?.map((attempt) => (
              <li key={attempt.id}>
                <time dateTime={attempt.startedAt}>
                  {new Date(attempt.startedAt).toLocaleString()}
                </time>
                : {attempt.status}
                {attempt.failureCode ? ` · ${attempt.failureCode}` : ""}
                {attempt.evidence?.fixtureCount !== undefined
                  ? ` · ${attempt.evidence.passedCount ?? 0}/${attempt.evidence.fixtureCount} passed`
                  : ""}
                <br />
                <code>{attempt.id}</code>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      <details>
        <summary>Review evidence</summary>
        <dl>
          <dt>Source definition</dt>
          <dd>
            <code>{item.sourceDescriptorHash}</code>
          </dd>
          <dt>Correction receipt</dt>
          <dd>
            <code>{item.proposalHash}</code>
          </dd>
          {item.releaseId ? (
            <>
              <dt>Release</dt>
              <dd>
                <code>{item.releaseId}</code>
              </dd>
            </>
          ) : null}
        </dl>
      </details>
      <p role="status">{status}</p>
    </article>
  );
}
