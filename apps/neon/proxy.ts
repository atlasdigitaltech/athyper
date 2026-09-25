import { NextResponse, type NextRequest } from "next/server";
import { parseEntityApplicationPath } from "@athyper/contract-platform-entity-runtime";
import { destinationRequestHeaders } from "@athyper/platform-shell-app-foundation/request-destination";
import { entityRecordAuthorizationPath } from "@/lib/entity-route-context";
import { resolveNeonEntityApplicationInternalRoute, resolveNeonEntityApplicationPublicRoute } from "@/lib/catalog-routes";

export function proxy(request: NextRequest) {
  const recordPath = entityRecordAuthorizationPath(request.nextUrl.pathname);
  if (recordPath) {
    const authorized = request.nextUrl.clone();
    authorized.pathname = recordPath;
    return NextResponse.next({
      request: { headers: destinationRequestHeaders({ url: authorized.toString(), headers: request.headers }) },
    });
  }
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
  const route = parseEntityApplicationPath(pathname);
  return route ? resolveNeonEntityApplicationInternalRoute(route.entityCode, route.segments) : undefined;
}

// Include all page requests and RSC/prefetch requests; never infer auth from cookies here.
export const config = { matcher: ["/((?!api(?:/|$)|_next(?:/|$)|favicon.ico$|robots.txt$|sitemap.xml$).*)"] };
