import {
  updatePrincipalLocaleOperation,
  type HttpClient,
} from "@athyper/platform-api-client";
export async function changeLocale(client: HttpClient, localeCode: string) {
  await client.request(updatePrincipalLocaleOperation, {
    body: { localeCode },
  });
  document.cookie = `athyper_locale=${localeCode}; Path=/; Max-Age=31536000; SameSite=Lax`;
  window.location.reload();
}
