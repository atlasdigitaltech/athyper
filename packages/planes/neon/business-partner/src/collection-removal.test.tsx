// @vitest-environment jsdom
import {act} from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
import {CollectionSection} from "../../../../platform/entity/runtime/form-detail/src/collection-section";
vi.mock("@athyper/platform-ui",()=>({Button:({variant,...props}:any)=><button {...props}/>,Dialog:({children}:any)=><div>{children}</div>,DialogContent:({title,children}:any)=><div role="dialog"><h2>{title}</h2>{children}</div>}));
it("uses the primary nested child's identity in the removal confirmation",async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const child:any={key:"child",sections:[{fields:[{control:"input",valueKey:"name",label:"Name",widget:"text"}]}]};
 const item:any={key:"item",sections:[{fields:[{control:"repeatableGroup",valueKey:"children",label:"Children",itemSurfaceKey:"child",primaryField:"primary",presentation:{titleFields:["name"],summary:[{field:"name"}]}}]}]};
 const field:any={control:"repeatableGroup",valueKey:"items",label:"Items",itemLabel:"Item",itemSurfaceKey:"item",minItems:0,maxItems:5,addLabel:"Add",removeLabel:"Remove",presentation:{summary:[{field:"children",format:"primary"}],removalConfirmation:{mode:"dialog",title:"Remove {item}",titleFields:["children"],message:"Remove item?",cancelLabel:"Cancel",confirmLabel:"Confirm"}}};
 const node=document.createElement("div");document.body.append(node);const root=createRoot(node);
 try {
  await act(async()=>root.render(<CollectionSection field={field} item={item} surfaces={[item,child]} rows={[{key:"parent",children:[{key:"child",primary:true,name:"Primary identity"}]}]} disabled={false} onChange={vi.fn()} renderItem={()=>null}/>));
  await act(async()=>node.querySelector<HTMLButtonElement>(".a-collection__remove")!.click());
  expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe("Remove Primary identity");
 }finally{await act(async()=>root.unmount());node.remove();}
});
