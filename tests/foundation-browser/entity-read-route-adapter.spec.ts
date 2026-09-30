import { build } from "esbuild";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";

// Exercise the real Studio/Mesh page exports and Neon's shared fallback without
// a Next server. Only framework 404 and the already-tested read surface are stubs.
const bundle = build({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `
import Studio from './apps/studio/app/(shell)/app/entity/[entityCode]/[[...segments]]/page';
import Mesh from './apps/mesh/app/(shell)/app/entity/[entityCode]/[[...segments]]/page';
import Neon from './apps/neon/app/(shell)/app/entity/[entityCode]/[[...segments]]/page';
window.inspectRoute=async(plane,params)=>{try{const view=plane==='studio'?await Studio({params:Promise.resolve(params)}):plane==='mesh'?await Mesh({params:Promise.resolve(params)}):await Neon({params:Promise.resolve(params)});return {accepted:true,props:view.props.children?.props ?? view.props,gated:Boolean(view.props.children)};}catch(error){if(error.message!=='NOT_FOUND')throw error;return {accepted:false};}};
`,
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  tsconfig: resolve("tooling/config/tsconfig-react.json"),
  plugins: [
    {
      name: "read-route-fixture",
      setup(builder) {
        builder.onResolve({ filter: /^next\/navigation$/ }, () => ({
          path: "navigation",
          namespace: "fixture",
        }));
        builder.onResolve({ filter: /^@athyper\/product-neon-shell$/ }, () => ({path:'gate',namespace:'fixture'}));
        builder.onResolve({ filter: /entity-read-surface$/ }, () => ({
          path: "surface",
          namespace: "fixture",
        }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
          loader: "js",
          contents:
            args.path === "gate" ? `export const NeonWorkContextGate=()=>null;` : args.path === "navigation"
              ? `export const notFound=()=>{throw Error('NOT_FOUND')};`
              : `export const EntityReadSurface=()=>null;`,
        }));
      },
    },
  ],
}).then((result) => result.outputFiles[0]!.text);

test("three read adapters preserve Country coordinates and identical not-found semantics", async ({
  page,
}) => {
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: await bundle });
  const recordId = "01a0d433-806b-7874-862d-49a9b955f6a1";
  for (const plane of ["studio", "mesh", "neon"]) {
    for (const segments of [[], ["manage"], [recordId]]) {
      const result = await page.evaluate(
        ({ plane, segments }) =>
          (window as any).inspectRoute(plane, {
            entityCode: "country",
            segments,
          }),
        { plane, segments },
      );
      expect(result).toEqual({
        accepted: true,
        gated: false,
        props: {
          entityCode: "country",
          ...(segments[0] === recordId ? { recordId } : {}),
        },
      });
    }
    for (const params of [
      { entityCode: "Country" },
      { entityCode: "country", segments: ["new"] },
      { entityCode: "country", segments: [recordId, "edit"] },
      { entityCode: "country", segments: ["../manage"] },
    ]) {
      expect(
        await page.evaluate(
          ({ plane, params }) => (window as any).inspectRoute(plane, params),
          { plane, params },
        ),
      ).toEqual({ accepted: false });
    }
  }
});
