import type { Metadata } from "next";
import { AtlasWorkspace } from "@athyper/platform-shell";
export const metadata:Metadata={title:"Atlas AI"};
export default function AtlasPage(){return <AtlasWorkspace mode="fullscreen" planeName="Mesh" currentPath="/atlas"/>;}
