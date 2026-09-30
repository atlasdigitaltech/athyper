async function startCaptureStepUp(context, page, origin) {
  const endpoint = new URL("/api/auth/step-up/start?returnTo=%2Fhome", origin);
  const cookies = await context.cookies(endpoint.href);
  const csrf =
    cookies.find((cookie) => cookie.name === "__Host-athyper-csrf") ??
    cookies.find((cookie) => cookie.name === "athyper-csrf");
  if (!csrf?.value) throw Error("Step-up capture: CSRF cookie unavailable");

  // BrowserContext.request shares cookies with the interactive browser. Stop
  // before the issuer redirect so login and MFA still happen in its browser UI.
  const response = await context.request.post(endpoint.href, {
    headers: {
      origin: endpoint.origin,
      "sec-fetch-site": "same-origin",
      "x-csrf-token": decodeURIComponent(csrf.value),
    },
    maxRedirects: 0,
  });
  const status = response.status();
  const location = response.headers().location;
  await response.dispose();
  if (![302, 303].includes(status) || !location) {
    throw Error(`Step-up capture: start rejected (HTTP ${status})`);
  }
  const authorization = new URL(location, endpoint);
  if (authorization.protocol !== "https:") {
    throw Error("Step-up capture: invalid authorization redirect");
  }
  await page.goto(authorization.href);
}

module.exports = { startCaptureStepUp };
