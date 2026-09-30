import { existsSync, watch } from "node:fs";
import { join } from "node:path";
import { command } from "./runtime.mjs";
import { readJson } from "./model.mjs";

export async function dependencyPlan(plan) {
  const workspace = JSON.parse(
    await command("pnpm", [
      "--dir",
      plan.checkout,
      "list",
      "-r",
      "--depth",
      "-1",
      "--json",
    ]),
  );
  const packages = new Map(
    workspace.map((item) => [
      item.name,
      { ...item, manifest: readJson(join(item.path, "package.json")) },
    ]),
  );
  const roots = [
    readJson(join(plan.checkout, "server/apps/platform-host/package.json"))
      .name,
    ...plan.apps.map(
      (app) => readJson(join(plan.checkout, "apps", app, "package.json")).name,
    ),
  ];
  const selected = new Map();
  const visiting = new Set();
  function visit(name) {
    if (selected.has(name)) return;
    if (visiting.has(name))
      throw new Error(`Workspace dependency cycle: ${name}`);
    const item = packages.get(name);
    if (!item) return;
    visiting.add(name);
    const dependencies = Object.keys({
      ...item.manifest.dependencies,
      ...item.manifest.optionalDependencies,
    }).filter((name) => packages.has(name));
    for (const dependency of dependencies) visit(dependency);
    visiting.delete(name);
    const output = JSON.stringify([item.manifest.main, item.manifest.exports]);
    selected.set(name, {
      name,
      path: item.path,
      dependencies,
      build:
        !roots.includes(name) &&
        /(?:dist|lib)\/[^"\s]*\.(?:js|mjs|cjs)/.test(output),
      buildScript: item.manifest.scripts?.build,
    });
  }
  roots.forEach(visit);
  for (const item of selected.values())
    if (item.build && !item.buildScript)
      throw new Error(`Compiled dependency has no build script: ${item.name}`);
  return [...selected.values()];
}
export async function buildDependencies(
  plan,
  graph,
  selected = new Set(
    graph.filter((item) => item.build).map((item) => item.name),
  ),
) {
  const pending = graph.filter((item) => selected.has(item.name));
  const completed = new Set();
  while (pending.length) {
    const ready = pending
      .filter((item) =>
        item.dependencies.every(
          (name) => !selected.has(name) || completed.has(name),
        ),
      )
      .slice(0, plan.resources.buildConcurrency);
    if (!ready.length) throw new Error("Cannot order workspace builds");
    const results = await Promise.allSettled(
      ready.map((item) =>
        command("pnpm", ["--dir", item.path, "run", "build"], {
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            NODE_ENV: "development",
          },
        }),
      ),
    );
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === "rejected")
        throw new Error(`${ready[i].name}: ${results[i].reason.message}`);
      completed.add(ready[i].name);
      pending.splice(pending.indexOf(ready[i]), 1);
    }
  }
}
export function watchDependencies(plan, graph, onBuild, onError) {
  const watches = [];
  let timer;
  let rebuilding = false;
  const dirty = new Set();
  async function flush() {
    if (rebuilding || !dirty.size) return;
    rebuilding = true;
    const selected = new Set(dirty);
    dirty.clear();
    for (const item of graph)
      if (item.build && item.dependencies.some((name) => selected.has(name)))
        selected.add(item.name);
    try {
      const started = Date.now();
      await buildDependencies(plan, graph, selected);
      onBuild({ packages: [...selected], elapsedMs: Date.now() - started });
    } catch (error) {
      onError(error);
    } finally {
      rebuilding = false;
      if (dirty.size) timer = setTimeout(flush, 150);
    }
  }
  for (const item of graph.filter((item) => item.build)) {
    const source = join(item.path, "src");
    if (!existsSync(source))
      throw new Error(
        `Compiled dependency needs an explicit watch root: ${item.name}`,
      );
    watches.push(
      watch(source, { recursive: true }, () => {
        dirty.add(item.name);
        clearTimeout(timer);
        timer = setTimeout(flush, 150);
      }),
    );
  }
  return () => {
    clearTimeout(timer);
    for (const watcher of watches) watcher.close();
  };
}
