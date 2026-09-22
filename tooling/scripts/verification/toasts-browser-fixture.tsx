import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ToastProvider, useToasts } from "../../../packages/platform/shell/app-foundation/src/toasts";
import { Dialog, DialogContent } from "../../../packages/platform/foundation/ui/src/index";
function Consumer(){
  const toasts=useToasts(),[open,setOpen]=useState(false);
  (window as any).pushToast=toasts.push;
  return <><button onClick={()=>toasts.push({tone:"success",title:"Folder ‘Invoices’ deleted"})}>Delete fixture folder</button><button onClick={()=>setOpen(true)}>Open modal</button><Dialog open={open} onOpenChange={setOpen}><DialogContent portal title="Edit fixture"><button onClick={()=>setOpen(false)}>Close modal</button></DialogContent></Dialog></>;
}
function Fixture(){
 const [scope,setScope]=useState(0);
 (window as any).resetToastContext=()=>setScope(value=>value+1);
 return <ToastProvider key={scope}><Consumer/></ToastProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture/>);
