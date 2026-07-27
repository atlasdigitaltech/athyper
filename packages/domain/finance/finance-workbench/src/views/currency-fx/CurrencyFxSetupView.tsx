import { CompanyCurrencyFxSettingsPage } from "./CompanyCurrencyFxSettingsPage";

/**
 * Compatibility export for the established Company Currency & FX route.
 * New code should use CompanyCurrencyFxSettingsPage directly.
 */
export function CurrencyFxSetupView({companyCode}:{companyCode:string}) {
  return <CompanyCurrencyFxSettingsPage companyCode={companyCode}/>;
}
