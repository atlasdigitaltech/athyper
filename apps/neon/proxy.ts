import { NextResponse, type NextRequest } from "next/server";
import { destinationRequestHeaders } from "@athyper/platform-shell-app-foundation/request-destination";
import { resolveNeonEntityApplicationInternalRoute, resolveNeonEntityApplicationPublicRoute } from "@/lib/catalog-routes";

export function proxy(request: NextRequest) {
  const publicRoute = resolveNeonEntityApplicationPublicRoute(request.nextUrl.pathname);
  if (publicRoute) {
    const internal = request.nextUrl.clone();
    internal.pathname = publicRoute.internalPath;
    return NextResponse.rewrite(internal, {
      request: { headers: destinationRequestHeaders(request) },
    });
  }
  const internalRoute = internalEntityRoute(request.nextUrl.pathname);
  if (internalRoute) {
    const canonical = request.nextUrl.clone();
    canonical.pathname = internalRoute.publicPath;
    return NextResponse.next({
      request: {
        headers: destinationRequestHeaders({ url: canonical.toString(), headers: request.headers }),
      },
    });
  }
  return NextResponse.next({ request: { headers: destinationRequestHeaders(request) } });
}

function internalEntityRoute(pathname: string) {
  const match = /^\/app\/entity\/([A-Za-z][A-Za-z0-9_.-]{0,126})(?:\/(.*))?\/?$/u.exec(pathname);
  if (!match) return undefined;
  const segments = match[2] ? match[2].split("/").filter(Boolean) : [];
  return resolveNeonEntityApplicationInternalRoute(match[1]!, segments);
}

// Include all page requests and RSC/prefetch requests; never infer auth from cookies here.
export const config = { matcher: ["/((?!api(?:/|$)|_next(?:/|$)|favicon.ico$|robots.txt$|sitemap.xml$).*)"] };
