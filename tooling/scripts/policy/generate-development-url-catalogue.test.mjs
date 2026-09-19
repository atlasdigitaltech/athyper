import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  appPath,
  auditCatalogue,
  openApiInventory,
  renderCatalogue,
} from "./generate-development-url-catalogue.mjs";
import { extractStaticUrlRoutes } from "./extract-static-url-routes.mjs";

test("duplicate audit respects origins, HTTP methods and catch-all semantics", () => {
  const report = auditCatalogue([
    "Base URL: [https://neon.dev.athyper.test]",
    "- **GET** `/items/{id}`",
    "- **GET** `/items/{entityId}`",
    "- **POST, PUT** `/items/{id}`",
    "- **GET** `/items/{path...}`",
    "- **GET** `/items/{segments...?}`",
    "Base URL: [https://mesh.dev.athyper.test]",
    "- **GET** `/items/{recordId}`",
    "Base URL: [https://api.dev.athyper.test]",
    "- **GET** `/items/{id}`",
    "- **GET** `/items/{id}`",
  ]).join("\n");
  assert.ok(
    report.includes("| https://neon.dev.athyper.test | 6 | 5 | 1 | 1 |"),
  );
  assert.ok(
    report.includes("| https://mesh.dev.athyper.test | 1 | 1 | 0 | 0 |"),
  );
  assert.ok(
    report.includes("| https://api.dev.athyper.test | 2 | 1 | 1 | 0 |"),
  );
  assert.ok(report.includes("`/items/{id}`<br>`/items/{entityId}`"));
  assert.ok(
    report.includes(
      "1 method/path shapes are shared across application origins.",
    ),
  );
});

test("OpenAPI inventory includes every HTTP method and preserves parameters, ignoring path metadata", () => {
  const inventory = openApiInventory({
    openapi: "3.1.0",
    paths: {
      "/items/{itemId}": {
        parameters: [],
        summary: "Items",
        get: { operationId: "items.read" },
        head: {},
        options: {},
        trace: {},
        patch: {},
        delete: {},
        post: {},
        put: {},
      },
    },
  });
  assert.equal(inventory.length, 8);
  assert.ok(inventory.every((route) => route.path === "/items/{itemId}"));
  assert.equal(
    inventory.find((route) => route.method === "GET").operationId,
    "items.read",
  );
  assert.throws(() => openApiInventory({ paths: {} }), /nonempty/);
});

test("Next route patterns strip route groups and preserve optional versus required catch-all segments", () => {
  assert.equal(
    appPath("(shell)/[workspaceSlug]/[moduleSlug]/[[...segments]]/page.tsx"),
    "/{workspaceSlug}/{moduleSlug}/{segments...?}",
  );
  assert.equal(appPath("api/relay/[...path]/route.ts"), "/api/relay/{path...}");
  assert.equal(appPath("(shell)/page.tsx"), "/");
});

test("static scanner expands aliases, object loops, helper factories and prefix closures", () => {
  const source = `
    function register(app) {
      app.get(['/native/:id', '/compat/:id'], handler);
      for(const config of [{path:'supplier'}, {path:'customer'}] as const) app.post(\`/\${config.path}/accept\`, handler);
      action(app, 'publish');
      transfer(app, {prefix:'/api/records'});
      transfer(app, {prefix:'/api/v1/records'});
    }
    function action(app, name) { app.post(\`/items/:id/\${name}\`, handler); }
    function transfer(app, options) {
      const api = (suffix) => \`\${options.prefix}\${suffix}\`;
      registerContractRoute(app, contract('get', api('/imports/:id')), handler);
    }
    function contract(method, path) { return defineRouteContract({method, path}); }
  `;
  const result = extractStaticUrlRoutes(source);
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(
    result.routes.map((r) => `${r.method} ${r.declaredPath}`).sort(),
    [
      "GET /api/records/imports/:id",
      "GET /api/v1/records/imports/:id",
      "GET /compat/:id",
      "GET /native/:id",
      "POST /customer/accept",
      "POST /items/:id/publish",
      "POST /supplier/accept",
    ],
  );
});

test("static scanner expands descriptor paths and reports unresolved declarations", () => {
  const result = extractStaticUrlRoutes(`
    descriptor('finance.budget.read', 'read');
    descriptor('finance.budget.write', 'write');
    function descriptor(code, action) {
      const suffix = code.replace(/^finance\\./, '').replaceAll('.', '/');
      return {kind:'route', method: action === 'read' ? 'get' : 'post', path: \`/api/neon/finance/\${suffix}\`};
    }
    function register(app, options) { app.post(options.dynamicPath, handler); }
  `);
  assert.deepEqual(
    result.routes.map((r) => `${r.method} ${r.declaredPath}`).sort(),
    [
      "GET /api/neon/finance/budget/read",
      "POST /api/neon/finance/budget/write",
    ],
  );
  assert.equal(result.unresolved.length, 1);
  assert.match(result.unresolved[0].expression, /options.dynamicPath/);
});

test("catalogue covers the complete Swagger snapshot, compatibility APIs, finance and all app categories", async () => {
  const snapshot = JSON.parse(
    readFileSync(
      new URL(
        "../../../docs/architecture/business-partner/development-openapi-inventory.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const markdown = await renderCatalogue(snapshot);
  const deployed = markdown
    .split("## Runtime APIs in deployed Swagger")[1]
    .split("## Additional backend APIs declared in source")[0];
  assert.equal(
    deployed
      .split("\n")
      .filter((line) =>
        /^- \*\*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE)\*\*/.test(line),
      ).length,
    snapshot.operations.length,
  );
  for (const operation of snapshot.operations) {
    const path = operation.path.includes("{")
      ? `\`${operation.path}\``
      : `[${operation.path}](https://api.dev.athyper.test${operation.path})`;
    assert.ok(
      deployed.includes(`- **${operation.method}** ${path}`),
      `${operation.method} ${operation.path}`,
    );
  }
  assert.ok(!deployed.includes("Not found by source scanner"));
  for (const path of [
    "/api/neon/business-partner-cases/{requestId}/materialize",
    "/api/neon/business-partner-requests/{requestId}/apply",
    "/api/neon/external/candidate-registrations/accept",
    "/api/content/items/{id}/publish",
    "/api/meta-entity-authoring/change-sets/{id}/publish",
    "/api/neon/finance/budget/command",
  ])
    assert.ok(markdown.includes(path), path);
  for (const app of ["studio", "neon", "mesh"]) {
    const section = markdown
      .split(
        `## ${app === "studio" ? "Studio" : app.toUpperCase()} application URLs`,
      )[1]
      .split("\n## ")[0];
    assert.ok(section.includes(`Base URL: [https://${app}.dev.athyper.test]`));
    for (const path of [
      "/api/auth/mfa/verify",
      "/api/relay/{path...}",
      "/livez",
      "/{workspaceSlug}",
    ])
      assert.ok(section.includes(path));
  }
  assert.match(markdown, /auth.step_up_required/);
});

test("explicit callback middleware does not declare endpoints or inspect handler bodies", () => {
  const result = extractStaticUrlRoutes(`
    application.use((request, response, next) => { app.get(dynamicPath, handler); next(); });
    app.use(function (request, response, next) { next(); });
    app.use(((request, response, next) => next()) as RequestHandler);
    app.use((req, res, next) => next(), (error, req, res, next) => next(error));
    app.get('/health', handler);
  `);
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(
    result.routes.map(({ method, declaredPath }) => [method, declaredPath]),
    [["GET", "/health"]],
  );
});

test("router mounts and ambiguous use registrations still fail extraction", () => {
  for (const registration of [
    "app.use(router)",
    'app.use("/api", router)',
    "app.use(prefix, handler)",
    "app.use(handler)",
    "app.use()",
    "app.use(...handlers)",
    "app.use((req, res, next) => next(), router)",
    "app.post(dynamicPath, handler)",
    "app.route(dynamicPath)",
  ]) {
    const result = extractStaticUrlRoutes(registration);
    assert.equal(result.unresolved.length, 1, registration);
    assert.equal(result.routes.length, 0, registration);
  }
});

test("finite route conditions resolve boolean combinations without guessing dynamic operands", () => {
  const result = extractStaticUrlRoutes(
    `
    for (const operation of ['list', 'get', 'review'] as const) {
      const method = operation === 'list' || operation === 'get' ? 'get' : 'post';
      defineRouteContract({method, path: operation === 'list' ? '/banks' : '/banks/' + operation});
    }
  `.replace("'/banks/' + operation", "`/banks/${operation}`"),
  );
  assert.equal(result.unresolved.length, 0);
  assert.deepEqual(
    result.routes.map(({ method, declaredPath }) => [method, declaredPath]),
    [
      ["GET", "/banks"],
      ["GET", "/banks/get"],
      ["POST", "/banks/review"],
    ],
  );
  assert.equal(
    extractStaticUrlRoutes(`app.get(unknown || flag ? '/a' : '/b', handler)`)
      .unresolved.length,
    1,
  );
});
