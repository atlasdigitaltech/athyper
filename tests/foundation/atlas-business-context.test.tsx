import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import {
  AtlasAnswerProvider,
  useAtlasAnswer,
  useAtlasBusinessContextPublisher,
  type AtlasBusinessContextInput,
} from "../../packages/platform/ai/agent-ui/src/index";
import { AtlasBusinessContextStore } from "../../packages/platform/ai/agent-ui/src/business-context";
import type {
  AtlasAnswerClient,
  AtlasAnswerOptions,
  AtlasGroundedAnswer,
} from "../../packages/platform/ai/agent-runtime/src/index";
const a = "10000000-0000-4000-8000-000000000001",
  b = "20000000-0000-4000-8000-000000000002";
const manage: AtlasBusinessContextInput = {
  kind: "manage",
  entityCode: "business_partner",
  locale: "en",
  filters: [],
  sort: [],
  selectedIds: [a],
  visibleIds: [a, b],
  analysisTarget: "selection",
  pageSize: 25,
  pageIndex: 0,
};
const record = (id: string): AtlasBusinessContextInput => ({
  kind: "record",
  entityCode: "business_partner",
  recordId: id,
  locale: "en",
  section: "overview",
  dirty: false,
});
let dom: JSDOM, root: Root;
beforeEach(() => {
  dom = new JSDOM("<div id='root'></div>", {
    url: "https://test.athyper.local/mdg/business-partner/manage",
  });
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    sessionStorage: { configurable: true, value: dom.window.sessionStorage },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
  });
  root = createRoot(document.querySelector("#root")!);
});
afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
});
test("Manage survives a record panel and identical renders keep generation; fullscreen handoff is identity bound", () => {
  const store = new AtlasBusinessContextStore();
  store.publish("list", manage);
  const list = store.snapshot();
  store.publish("list", { ...manage });
  assert.equal(store.snapshot(), list);
  store.publish("panel", record(a));
  assert.equal(store.snapshot()?.kind, "record");
  store.publish("list", { ...manage, search: "updated" });
  assert.equal(store.snapshot()?.kind, "record");
  const token = store.handoff("tenant:principal")!;
  const other = new AtlasBusinessContextStore();
  other.restore("different:principal", token);
  assert.equal(other.snapshot(), undefined);
  other.restore("tenant:principal", token);
  assert.deepEqual(other.snapshot(), store.snapshot());
  store.remove("panel");
  assert.equal(store.snapshot()?.kind, "manage");
  assert.equal(
    store.snapshot()?.kind === "manage" &&
      store.snapshot()?.generationId !== list?.generationId,
    true,
  );
  store.remove("list");
  assert.equal(store.snapshot(), undefined);
});
test("navigation aborts a request and discards late text, actions and completion even when the client ignores abort", async () => {
  let controller: ReturnType<typeof useAtlasAnswer>;
  const calls: {
    options: AtlasAnswerOptions;
    resolve: (answer: AtlasGroundedAnswer) => void;
  }[] = [];
  const client = {
    experience: async () => null,
    threads: async () => ({ items: [] }),
    answer: async (_: string, options: AtlasAnswerOptions) =>
      new Promise<AtlasGroundedAnswer>((resolve) =>
        calls.push({ options, resolve }),
      ),
  } as unknown as AtlasAnswerClient;
  function Page({ id }: { id: string }) {
    useAtlasBusinessContextPublisher(record(id));
    controller = useAtlasAnswer();
    return null;
  }
  const render = (id: string) =>
    root.render(
      <AtlasAnswerProvider options={{ client, scopeKey: "test" }}>
        <Page id={id} />
      </AtlasAnswerProvider>,
    );
  await act(async () => render(a));
  let pending: Promise<void>;
  await act(async () => {
    pending = controller!.ask("Explain this record");
  });
  assert.equal(calls[0]!.options.businessContext?.kind, "record");
  await act(async () => {
    calls[0]!.options.onProgress?.({ kind: "text", text: "A partial" });
  });
  assert.equal(controller!.text, "A partial");
  await act(async () => render(b));
  assert.equal(calls[0]!.options.signal?.aborted, true);
  assert.equal(controller!.text, "");
  await act(async () => {
    calls[0]!.options.onProgress?.({ kind: "text", text: "A late" });
    calls[0]!.resolve({
      threadId: "thread-a",
      runId: "run-a",
      text: "A completed",
      publicModelId: "atlas-fast",
      citations: [],
      attachmentCitations: [],
      actions: [],
    });
    await pending!;
  });
  assert.equal(controller!.text, "");
  assert.equal(controller!.threadId, undefined);
  assert.equal(
    controller!.businessContext?.kind === "record" &&
      controller!.businessContext.recordId,
    b,
  );
  await act(async () => {
    pending = controller!.ask("Explain B");
  });
  assert.equal(calls[1]!.options.threadId, undefined);
  await act(async () => {
    calls[1]!.resolve({
      threadId: "thread-b",
      runId: "run-b",
      text: "B completed",
      publicModelId: "atlas-fast",
      citations: [],
      attachmentCitations: [],
      actions: [],
    });
    await pending!;
  });
  assert.equal(controller!.text, "B completed");
});

test("an in-flight confirmed command retains its original target receipt after navigation", async () => {
  let controller: ReturnType<typeof useAtlasAnswer>;
  let complete: (value: unknown) => void = () => {};
  const client = {
    experience: async () => null,
    threads: async () => ({ items: [] }),
    confirmAction: async () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  } as unknown as AtlasAnswerClient;
  function Page({ id }: { id: string }) {
    useAtlasBusinessContextPublisher(record(id));
    controller = useAtlasAnswer();
    return null;
  }
  const render = (id: string) =>
    root.render(
      <AtlasAnswerProvider options={{ client }}>
        <Page id={id} />
      </AtlasAnswerProvider>,
    );
  await act(async () => render(a));
  let pending: Promise<void>;
  const action = {
    proposalId: "proposal-a",
    affectedEntityId: a,
    status: "proposed",
    summary: "Submit A",
  } as any;
  await act(async () => {
    pending = controller!.confirmAction(action);
  });
  await act(async () => render(b));
  await act(async () => {
    complete({ outcome: "completed", commandId: "command-a" });
    await pending!;
  });
  assert.equal(controller!.actions.length, 0);
  assert.equal(controller!.actionMessage, undefined);
  assert.equal(controller!.actionReceipts[0]?.action.affectedEntityId, a);
  assert.equal(controller!.actionReceipts[0]?.commandId, "command-a");
});

test("role, company, dirty and historical changes create new snapshots without serializing draft values", () => {
  const store = new AtlasBusinessContextStore("fr");
  store.publish("record", record(a));
  const initial = store.snapshot()?.generationId;
  store.publish("record", {
    ...record(a),
    locale: undefined,
    roleLens: "supplier",
    workContext: { companyCodeId: b },
    dirty: true,
    savedRevision: "7",
    asOf: "2025-01-01T00:00:00Z",
  });
  assert.notEqual(store.snapshot()?.generationId, initial);
  assert.equal(store.snapshot()?.locale, "fr");
  assert.equal(
    store.snapshot()?.kind === "record" && store.snapshot()?.dirty,
    true,
  );
  assert.equal("values" in store.snapshot()!, false);
});

test("history without a matching page binding cannot become the next request's context", async () => {
  let controller: ReturnType<typeof useAtlasAnswer>,
    sent: AtlasAnswerOptions | undefined;
  const client = {
    experience: async () => null,
    threads: async () => ({ items: [] }),
    messages: async () => ({
      items: [
        {
          messageId: "old",
          role: "assistant",
          text: "Old record",
          results: [],
        },
      ],
    }),
    answer: async (_: string, options: AtlasAnswerOptions) => {
      sent = options;
      return {
        threadId: "new",
        text: "Current record",
        publicModelId: "atlas-fast",
        citations: [],
        attachmentCitations: [],
        actions: [],
      };
    },
  } as unknown as AtlasAnswerClient;
  function Page() {
    useAtlasBusinessContextPublisher(record(b));
    controller = useAtlasAnswer();
    return null;
  }
  await act(async () =>
    root.render(
      <AtlasAnswerProvider options={{ client }}>
        <Page />
      </AtlasAnswerProvider>,
    ),
  );
  await act(async () => controller!.selectThread("old"));
  assert.equal(controller!.historyContextUnbound, true);
  await act(async () => controller!.ask("Explain this record"));
  assert.equal(sent?.threadId, undefined);
  assert.equal(
    controller!.messages.some((message) => message.messageId === "old"),
    false,
  );
});

test("automatic briefs require rollout and opt-in, deduplicate mounts, ignore section/draft changes and refresh saved state", async () => {
  let controller: ReturnType<typeof useAtlasAnswer>;
  let count = 0;
  const client = {
    experience: async () => null, threads: async () => ({items: []}),
    answer: async () => {
      count++;
      return {threadId: `t${count}`, text: "Brief", publicModelId: "atlas-fast", citations: [], attachmentCitations: [], actions: []};
    },
  } as unknown as AtlasAnswerClient;
  function Page({revision = "1", section = "overview", dirty = false}) {
    useAtlasBusinessContextPublisher({...record(a), savedRevision: revision, section, dirty});
    controller = useAtlasAnswer();
    React.useEffect(() => controller.mountWorkspace(), [controller.mountWorkspace]);
    return null;
  }
  const render = (enabled: boolean, revision = "1", section = "overview", dirty = false) => root.render(
    <React.StrictMode><AtlasAnswerProvider options={{client, proactiveBriefsEnabled: enabled}}><Page revision={revision} section={section} dirty={dirty}/></AtlasAnswerProvider></React.StrictMode>,
  );
  const debounce = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
  await act(async () => render(false));
  await act(async () => controller!.setAutomaticBriefsEnabled(true));
  await debounce();
  assert.equal(count, 0);
  await act(async () => render(true));
  await debounce();
  assert.equal(count, 0);
  await act(async () => controller!.setAutomaticBriefsEnabled(true));
  await debounce();
  assert.equal(count, 1);
  await act(async () => render(true, "1", "banking", true));
  await debounce();
  assert.equal(count, 1);
  await act(async () => render(true, "2", "banking"));
  await debounce();
  assert.equal(count, 2);
  await act(async () => controller!.refreshBrief());
  assert.equal(count, 3);
  await act(async () => render(false));
  assert.equal(controller!.automaticBriefsEnabled, false);
});

test("concurrent identical questions generate once and cancel discards a late completion", async () => {
  let controller: ReturnType<typeof useAtlasAnswer>, resolve!: (answer: AtlasGroundedAnswer) => void;
  let count = 0;
  const client = {
    experience: async () => null, threads: async () => ({items: []}),
    answer: async () => { count++; return new Promise<AtlasGroundedAnswer>(done => {resolve = done;}); },
  } as unknown as AtlasAnswerClient;
  function Page() { useAtlasBusinessContextPublisher(record(a)); controller = useAtlasAnswer(); return null; }
  await act(async () => root.render(<AtlasAnswerProvider options={{client}}><Page/></AtlasAnswerProvider>));
  let pending!: Promise<void>;
  await act(async () => { pending = controller!.ask("Brief"); void controller!.ask("Brief"); });
  assert.equal(count, 1);
  await act(async () => controller!.cancel());
  await act(async () => {resolve({threadId: "late", text: "Obsolete", publicModelId: "atlas-fast", citations: [], attachmentCitations: [], actions: []}); await pending;});
  assert.equal(controller!.status, "idle");
  assert.equal(controller!.threadId, undefined);
  assert.equal(controller!.messages.at(-1)?.status, "cancelled");
});

test("closing the last workspace cancels an automatic brief even after an older aborted run settles", async () => {
  let controller: ReturnType<typeof useAtlasAnswer>;
  const calls: {options: AtlasAnswerOptions; resolve: (answer: AtlasGroundedAnswer) => void}[] = [];
  const client = {
    experience: async () => null, threads: async () => ({items: []}),
    answer: async (_: string, options: AtlasAnswerOptions) => new Promise<AtlasGroundedAnswer>(resolve => calls.push({options, resolve})),
  } as unknown as AtlasAnswerClient;
  function Workspace() { const atlas = useAtlasAnswer(); React.useEffect(() => atlas.mountWorkspace(), [atlas.mountWorkspace]); return null; }
  function Page({id, open}: {id: string; open: boolean}) {
    useAtlasBusinessContextPublisher({...record(id), savedRevision: "1"});
    controller = useAtlasAnswer();
    return open ? <Workspace/> : null;
  }
  const render = (id: string, open = true) => root.render(<AtlasAnswerProvider options={{client, proactiveBriefsEnabled: true}}><Page id={id} open={open}/></AtlasAnswerProvider>);
  const debounce = () => act(async () => {await new Promise(resolve => setTimeout(resolve, 350));});
  await act(async () => render(a));
  await act(async () => controller!.setAutomaticBriefsEnabled(true));
  await debounce();
  await act(async () => render(b));
  assert.equal(calls[0]!.options.signal?.aborted, true);
  await debounce();
  assert.equal(calls.length, 2);
  await act(async () => calls[0]!.resolve({threadId: "a", text: "Stale A", publicModelId: "atlas-fast", citations: [], attachmentCitations: [], actions: []}));
  await act(async () => render(b, false));
  assert.equal(calls[1]!.options.signal?.aborted, true);
  assert.equal(controller!.status, "idle");
  await act(async () => calls[1]!.resolve({threadId: "b", text: "Late B", publicModelId: "atlas-fast", citations: [], attachmentCitations: [], actions: []}));
  assert.equal(controller!.threadId, undefined);
});


test("automatic brief keys exclude unsaved/historical records and include applied Manage scope", async () => {
  const {automaticBriefKey} = await import("../../packages/platform/ai/agent-ui/src/automatic-brief");
  const store = new AtlasBusinessContextStore();
  store.publish("page", record(a));
  assert.equal(automaticBriefKey(store.snapshot()), undefined);
  store.publish("page", {...record(a), savedRevision: "1", asOf: "2025-01-01T00:00:00Z"});
  assert.equal(automaticBriefKey(store.snapshot()), undefined);
  store.publish("page", manage);
  const first = automaticBriefKey(store.snapshot());
  assert.ok(first);
  store.publish("page", {...manage, selectedIds: [b]});
  assert.notEqual(automaticBriefKey(store.snapshot()), first);
  store.publish("page", {...manage, search: "Applied filter"});
  assert.notEqual(automaticBriefKey(store.snapshot()), first);
});
