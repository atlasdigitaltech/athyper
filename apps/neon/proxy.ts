import { NextResponse, type NextRequest } from "next/server";
import { destinationRequestHeaders } from "@athyper/platform-shell-app-foundation/request-destination";

export function proxy(request: NextRequest) {
  return NextResponse.next({ request: { headers: destinationRequestHeaders(request) } });
}

// Include all page requests and RSC/prefetch requests; never infer auth from cookies here.
export const config = { matcher: ["/((?!api(?:/|$)|_next(?:/|$)|favicon.ico$|robots.txt$|sitemap.xml$).*)"] };
