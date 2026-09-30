// Runs inside the DEV API container. Only synthetic data reaches native inference.
import { readFileSync } from "node:fs";
const config = JSON.parse(
  readFileSync("/athyper/config/atlas-local-inference.json", "utf8"),
);
const endpoint = config.endpoint;
const emit = (value) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), ...value }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (path, body) => {
  const r = await fetch(endpoint + path, {
    signal: AbortSignal.timeout(180000),
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  if (!r.ok) throw Error(`HTTP ${r.status}`);
  return r.json();
};
const message = (content) => [{ role: "user", content }];
const base = (messages, extra = {}) => ({
  model: config.model.upstream,
  messages,
  stream: true,
  think: false,
  keep_alive: "5m",
  options: { num_ctx: 4096, num_predict: 128, temperature: 0, seed: 42 },
  ...extra,
});
const long = (label) =>
  base(
    message(
      `Synthetic test ${label}. Write a detailed 1500-word numbered training guide on managing fictional warehouse inventory, with at least 60 detailed steps. Continue until you reach the limit.`,
    ),
    { options: { num_ctx: 4096, num_predict: 1024, temperature: 0, seed: 42 } },
  );
async function stream(
  id,
  category,
  body,
  { controller = new AbortController(), onFirst } = {},
) {
  const started = performance.now();
  let first = null,
    content = "",
    thinking = "",
    calls = [],
    terminal = null,
    status = null,
    firstEvent = null;
  const timeout = setTimeout(() => controller.abort("deadline"), 180000);
  try {
    const r = await fetch(endpoint + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    status = r.status;
    if (!r.ok)
      throw Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
    let pending = "";
    const decoder = new TextDecoder();
    const consume = (line) => {
      if (!line.trim()) return;
      const chunk = JSON.parse(line);
      if (chunk.error) throw Error(chunk.error);
      if (firstEvent === null) firstEvent = performance.now() - started;
      const m = chunk.message ?? {};
      content += m.content ?? "";
      thinking += m.thinking ?? "";
      calls.push(...(m.tool_calls ?? []));
      if (first === null && (m.content?.length || m.tool_calls?.length)) {
        first = performance.now() - started;
        onFirst?.();
      }
      if (chunk.done) terminal = chunk;
    };
    for await (const bytes of r.body) {
      pending += decoder.decode(bytes, { stream: true });
      let i;
      while ((i = pending.indexOf("\n")) >= 0) {
        consume(pending.slice(0, i));
        pending = pending.slice(i + 1);
      }
    }
    pending += decoder.decode();
    consume(pending);
    if (!terminal) throw Error("stream ended without terminal event");
    if (terminal.model !== config.model.upstream) throw Error("model mismatch");
    return {
      id,
      category,
      status,
      ok: true,
      ttftMs: first,
      firstEventMs: firstEvent,
      totalMs: performance.now() - started,
      content,
      thinking,
      toolCalls: calls,
      terminal,
      inputChars: JSON.stringify(body.messages).length,
      outputLimit: body.options.num_predict,
      throughput: terminal.eval_duration
        ? terminal.eval_count / (terminal.eval_duration / 1e9)
        : null,
    };
  } catch (e) {
    return {
      id,
      category,
      status,
      ok: false,
      aborted: controller.signal.aborted,
      error: String(e),
      ttftMs: first,
      totalMs: performance.now() - started,
      content,
      thinking,
      toolCalls: calls,
      inputChars: JSON.stringify(body.messages).length,
    };
  } finally {
    clearTimeout(timeout);
  }
}
async function measured(id, category, body, validate = () => true) {
  const r = await stream(id, category, body);
  r.qualityPassed = r.ok && !r.thinking && validate(r);
  emit({ type: "request", ...r });
  return r;
}
function startLong(id, category) {
  const controller = new AbortController();
  let ready;
  const first = new Promise((resolve) => (ready = resolve));
  const result = stream(id, category, long(id), {
    controller,
    onFirst: () => ready(true),
  }).then((r) => {
    ready(false);
    return r;
  });
  return { controller, first, result };
}
async function cancellation() {
  for (let i = 0; i < 3; i++) {
    const active = startLong(`cancel-active-${i}`, "cancellation");
    if (!(await active.first))
      throw Error("Cancellation fixture failed to start");
    await sleep(100);
    const abortedAt = performance.now();
    active.controller.abort("benchmark cancellation");
    const successor = await measured(
      `cancel-successor-${i}`,
      "cancellation-recovery",
      base(message(`Cancellation trial ${i}: reply with only OK.`), {
        options: { num_ctx: 4096, num_predict: 16, temperature: 0, seed: 42 },
      }),
    );
    emit({
      type: "cancellation",
      trial: i,
      active: await active.result,
      successorId: successor.id,
      releaseUpperBoundMs: successor.ttftMs === null ? null : successor.ttftMs,
      elapsedToSuccessorDoneMs: performance.now() - abortedAt,
      passed:
        successor.ok && successor.ttftMs !== null && successor.ttftMs <= 5000,
    });
  }
  const blocker = startLong("queue-cancel-blocker", "queued-cancellation");
  await blocker.first;
  const controller = new AbortController();
  const queued = stream(
    "cancel-queued",
    "queued-cancellation",
    long("queued cancellation"),
    { controller },
  );
  await sleep(500);
  const at = performance.now();
  controller.abort("cancel while queued");
  const canceled = await queued;
  blocker.controller.abort("release test blocker");
  await blocker.result;
  const recovery = await measured(
    "queued-cancel-recovery",
    "cancellation-recovery",
    base(message("Reply OK only.")),
  );
  emit({
    type: "queued-cancellation",
    canceled,
    clientAbortMs: performance.now() - at - recovery.totalMs,
    recoveryId: recovery.id,
    passed: canceled.aborted && recovery.ok && recovery.ttftMs <= 5000,
  });
}
async function saturation() {
  const blocker = startLong("saturation-blocker", "saturation");
  await blocker.first;
  const controllers = Array.from({ length: 14 }, () => new AbortController());
  const jobs = controllers.map((controller, i) =>
    stream(`saturation-${i}`, "saturation", long(`queue-${i}`), { controller }),
  );
  await sleep(1500);
  controllers.forEach((c) => c.abort("end saturation test"));
  blocker.controller.abort("end saturation test");
  const results = await Promise.all(jobs);
  const active = await blocker.result;
  const recovery = await measured(
    "saturation-recovery",
    "saturation-recovery",
    base(message("Reply OK only.")),
  );
  emit({
    type: "saturation",
    submitted: 15,
    active,
    results,
    rejected: results.filter((r) => r.status === 503 || r.status === 429)
      .length,
    recoveryId: recovery.id,
  });
  // The loaded-runner path differs from cold model scheduling; exercise both.
  await get("/api/generate", { model: config.model.upstream, keep_alive: 0 });
  const coldResults = await Promise.all(
    Array.from({ length: 18 }, (_, i) =>
      stream(
        `cold-queue-${i}`,
        "cold-saturation",
        base(message(`Queue trial ${i}. Reply only OK.`), {
          options: { num_ctx: 4096, num_predict: 16, temperature: 0, seed: 42 },
        }),
      ),
    ),
  );
  emit({
    type: "cold-saturation",
    submitted: 18,
    results: coldResults,
    rejected: coldResults.filter((r) => r.status === 503 || r.status === 429)
      .length,
    completed: coldResults.filter((r) => r.ok).length,
  });
}
const tool = {
  type: "function",
  function: {
    name: "lookup_order",
    description:
      "Read the status of a synthetic order by its exact ID. No side effects.",
    parameters: {
      type: "object",
      properties: { order_id: { type: "string" } },
      required: ["order_id"],
      additionalProperties: false,
    },
  },
};
async function tools() {
  for (const id of ["SYN-101", "SYN-202", "SYN-303"]) {
    const messages = message(
      `Use lookup_order to get the status of synthetic order ${id}. Do not invent a status.`,
    );
    const first = await measured(
      `tool-${id}`,
      "tool-call",
      base(messages, { tools: [tool] }),
      (r) =>
        r.toolCalls.length === 1 &&
        r.toolCalls[0].function.name === "lookup_order" &&
        r.toolCalls[0].function.arguments?.order_id === id,
    );
    if (first.qualityPassed) {
      await measured(
        `tool-followup-${id}`,
        "tool-followup",
        base(
          [
            ...messages,
            {
              role: "assistant",
              content: first.content,
              tool_calls: first.toolCalls,
            },
            {
              role: "tool",
              tool_name: "lookup_order",
              content: JSON.stringify({
                order_id: id,
                status: "awaiting_review",
              }),
            },
          ],
          { tools: [tool] },
        ),
        (r) => !r.toolCalls.length && /awaiting.review/i.test(r.content),
      );
    }
  }
  await measured(
    "tool-not-needed",
    "tool-negative",
    base(message("What is 2 + 2? Do not look up any orders."), {
      tools: [tool],
    }),
    (r) => r.toolCalls.length === 0 && r.content.includes("4"),
  );
}
async function interruption() {
  const active = startLong("interrupted-request", "interruption");
  if (!(await active.first))
    throw Error("Interruption fixture failed to start");
  emit({ type: "interrupt-now" });
  const at = performance.now();
  const result = await active.result;
  emit({ type: "interrupted-stream", ...result });
  let processReady = false;
  for (let i = 0; i < 120; i++) {
    try {
      await get("/api/version");
      processReady = true;
      break;
    } catch {
      await sleep(500);
    }
  }
  emit({
    type: "interruption-process-recovery",
    processReady,
    elapsedMs: performance.now() - at,
  });
  if (!processReady) throw Error("Inference failed to recover");
  await measured(
    "interruption-recovery",
    "interruption-recovery",
    base(message("Reply OK only.")),
  );
}
async function main() {
  const version = await get("/api/version");
  const tags = await get("/api/tags");
  const model = tags.models.find((m) => m.name === config.model.upstream);
  if (
    version.version !== config.engine.version ||
    !model ||
    "sha256:" + model.digest.replace(/^sha256:/, "") !== config.model.digest
  )
    throw Error("Pinned artifact mismatch");
  emit({ type: "identity", config, version, model });
  await get("/api/generate", { model: config.model.upstream, keep_alive: 0 });
  if ((await get("/api/ps")).models.length)
    throw Error("Cold-start model unload failed");
  await measured(
    "cold-1",
    "cold",
    base(message("Explain why inventory accuracy matters in three sentences.")),
  );
  const topics = [
    "inventory accuracy",
    "purchase approvals",
    "invoice matching",
    "supplier onboarding",
    "payment reconciliation",
    "stock forecasting",
    "audit trails",
    "access reviews",
    "order fulfillment",
    "data validation",
  ];
  for (let i = 0; i < 30; i++)
    await measured(
      `warm-short-${i + 1}`,
      "warm-short",
      base(
        message(
          `Synthetic case ${i + 1}. Explain ${topics[i % topics.length]} to a new employee in three concise sentences.`,
        ),
      ),
      (r) => r.content.length > 30,
    );
  for (let i = 0; i < 3; i++) {
    await measured(
      `summary-${i}`,
      "business-summary",
      base(
        message(
          `Summarize this fictional business update in three bullets, preserving the figures and action: Site ${i + 1} processed 120 orders, shipped 108, and delayed 12 because supplier Cedar was late. Revenue was 48000 credits and costs were 36000 credits. Mia will review supplier lead times on Friday.`,
        ),
        {
          options: {
            num_ctx: 4096,
            num_predict: 192,
            temperature: 0,
            seed: 42,
          },
        },
      ),
      (r) => ["120", "108", "12"].every((x) => r.content.includes(x)),
    );
    await measured(
      `context-${i}`,
      "multi-turn",
      base([
        {
          role: "user",
          content: `Remember project Lumen-${i}. Its budget is 73000 credits and owner is Nia.`,
        },
        { role: "assistant", content: "I have noted the project details." },
        {
          role: "user",
          content: "Change the owner to Omar; keep the budget unchanged.",
        },
        { role: "assistant", content: "The owner is now Omar." },
        {
          role: "user",
          content: "State the current project name, owner and budget.",
        },
      ]),
      (r) =>
        r.content.includes(`Lumen-${i}`) &&
        r.content.includes("Omar") &&
        /73,?000/.test(r.content),
    );
    const schema = {
      type: "object",
      properties: {
        order_id: { type: "string" },
        quantity: { type: "integer" },
        approved: { type: "boolean" },
      },
      required: ["order_id", "quantity", "approved"],
      additionalProperties: false,
    };
    await measured(
      `json-${i}`,
      "structured-json",
      base(
        message(
          `Extract JSON: synthetic order ORD-${i} has quantity 17 and is approved. Return only the object.`,
        ),
        { format: schema },
      ),
      (r) => {
        try {
          const o = JSON.parse(r.content);
          return (
            Object.keys(o).length === 3 &&
            o.order_id === `ORD-${i}` &&
            o.quantity === 17 &&
            o.approved === true
          );
        } catch {
          return false;
        }
      },
    );
  }
  for (const rows of [8, 32, 96, 192, 384]) {
    const input = Array.from(
      { length: rows },
      (_, i) => `Item ${i}: received 10 units; shipped 7 units.`,
    ).join("\n");
    await measured(
      `input-${rows}`,
      "input-scaling",
      base(
        message(
          `Synthetic ledger:\n${input}\nState the received and shipped quantity per item. Keep the answer to one sentence.`,
        ),
      ),
    );
  }
  await measured(
    "output-limit",
    "output-limit",
    long("full output limit"),
    (r) => r.terminal.eval_count <= 1024,
  );
  emit({ type: "gpu-offload", ps: await get("/api/ps") });
  await tools();
  await cancellation();
  await saturation();
  await interruption();
  emit({ type: "complete", ps: await get("/api/ps") });
}
main().catch((e) => {
  emit({ type: "fatal", error: String(e) });
  process.exitCode = 1;
});
