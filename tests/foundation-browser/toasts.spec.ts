import { buildSync } from "esbuild";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {test,expect} from "@playwright/test";
const bundle=buildSync({entryPoints:[resolve("tooling/scripts/verification/toasts-browser-fixture.tsx")],bundle:true,write:false,format:"iife",platform:"browser",jsx:"automatic",loader:{".css":"empty"},nodePaths:["apps/neon/node_modules"]}).outputFiles[0]!.text;
const css=["packages/platform/foundation/theme/src/styles.css","packages/platform/foundation/ui/src/styles.css"].map(path=>readFileSync(path,"utf8").replace(/@import[^;]+;/g,"")).join("\n");
test.beforeEach(async({page})=>{
 await page.route("https://toasts.test/",route=>route.fulfill({contentType:"text/html",body:`<html><head><style>${css}</style></head><body><div id="root"></div></body></html>`}));
 await page.goto("https://toasts.test/");await page.clock.install();await page.evaluate(bundle);
});
test("success is dismissible, deduplicated, temporary and does not steal focus",async({page})=>{
 const trigger=page.getByRole("button",{name:"Delete fixture folder"});
 await trigger.click();await trigger.click();
 await expect(page.locator(".a-global-toast")).toHaveCount(1);await expect(trigger).toBeFocused();
 await page.clock.runFor(5100);await expect(page.locator(".a-global-toast")).toHaveCount(0);
 await trigger.click();await page.getByRole("button",{name:"Dismiss notification"}).click();await expect(page.locator(".a-global-toast")).toHaveCount(0);
});
test("hover and keyboard focus pause the remaining timeout",async({page})=>{
 await page.getByRole("button",{name:"Delete fixture folder"}).click();
 await page.clock.runFor(2000);await page.locator(".a-global-toast").hover();await page.clock.runFor(6000);
 await expect(page.locator(".a-global-toast")).toHaveCount(1);
 await page.getByRole("button",{name:"Dismiss notification"}).focus();await page.mouse.move(0,0);await page.clock.runFor(6000);
 await expect(page.locator(".a-global-toast")).toHaveCount(1);
 await page.getByRole("button",{name:"Delete fixture folder"}).focus();await page.clock.runFor(3100);await expect(page.locator(".a-global-toast")).toHaveCount(0);
});
test("bounded successes preserve persistent warnings and context reset rejects old publishers",async({page})=>{
 await page.evaluate(()=>{
   (window as any).pushToast({tone:"warning",title:"Session ending soon"});
   for(let n=0;n<8;n++)(window as any).pushToast({tone:"success",title:`Saved ${n}`});
 });
 await expect(page.locator(".a-global-toast")).toHaveCount(2);
 await expect(page.locator(".a-toast--success")).toContainText("Saved 7");
 await page.clock.runFor(5100);await expect(page.locator(".a-global-toast")).toHaveCount(1);await expect(page.locator(".a-global-toast")).toContainText("Session ending soon");
 await page.evaluate(()=>{(window as any).oldPush=(window as any).pushToast;(window as any).resetToastContext();});
 await expect(page.locator(".a-global-toast")).toHaveCount(0);
 await page.evaluate(()=>(window as any).oldPush({tone:"success",title:"Old tenant secret"}));
 await expect(page.locator(".a-global-toast")).toHaveCount(0);
});
test("modal isolation pauses and hides the host; mobile placement respects the viewport",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.getByRole("button",{name:"Delete fixture folder"}).click();
 await page.getByRole("button",{name:"Open modal"}).click();
 await expect(page.locator(".a-toast-region")).toBeHidden();await page.clock.runFor(6000);
 await page.getByRole("button",{name:"Close modal"}).click();
 await expect(page.locator(".a-global-toast")).toBeVisible();
 const box=(await page.locator(".a-toast-region").boundingBox())!;
 expect(Math.abs(box.x+box.width/2-195)).toBeLessThan(2);expect(box.y+box.height).toBeLessThan(844);
 await page.clock.runFor(5100);await expect(page.locator(".a-global-toast")).toHaveCount(0);
});

test("desktop toast is centered and permits consecutive actions beside it",async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.evaluate(()=>{
   const button=document.createElement("button");button.textContent="Next file action";
   Object.assign(button.style,{position:"fixed",right:"16px",bottom:"24px"});
   let count=0;button.onclick=()=>{(window as any).pushToast({tone:"success",title:`File ${++count} deleted`});};
   document.body.appendChild(button);
 });
 const action=page.getByRole("button",{name:"Next file action"});
 await action.click();await action.click();await action.click();
 await expect(page.locator(".a-toast--success")).toHaveCount(1);
 await expect(page.locator(".a-toast--success")).toContainText("File 3 deleted");
 const box=(await page.locator(".a-toast-region").boundingBox())!;
 expect(Math.abs(box.x+box.width/2-720)).toBeLessThan(2);
 await expect(page.locator(".a-toast-region")).toHaveCSS("pointer-events","none");
 await page.evaluate(()=>(window as any).pushToast({tone:"success",title:"A very long filename ".repeat(20)}));
 const title=page.locator(".a-toast--success > strong");
 expect(await title.evaluate(el=>el.getBoundingClientRect().height<=parseFloat(getComputedStyle(el).lineHeight)*2+1)).toBe(true);
});
