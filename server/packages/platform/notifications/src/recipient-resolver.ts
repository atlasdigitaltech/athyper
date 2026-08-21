import type {
  NotificationRecipientResolver,
  PrincipalNotificationAddressDirectory,
  WhatsAppConsentRepository,
} from "@athyper/server-contract-notifications";

export function createNotificationRecipientResolver(dependencies: {
  readonly directory: PrincipalNotificationAddressDirectory;
  readonly whatsAppConsent: WhatsAppConsentRepository;
}): NotificationRecipientResolver {
  return {
    async resolve(input) {
      const [directory, whatsAppConsent] = await Promise.all([
        dependencies.directory.find(input),
        dependencies.whatsAppConsent.findOptedIn({
          tenantId: input.tenantId,
          principalId: input.principalId,
          planeKey: input.planeKey,
        }),
      ]);
      return {
        principalId: input.principalId,
        addresses: {
          in_app: input.principalId,
          push: input.principalId,
          ...(directory.email ? { email: directory.email } : {}),
          ...(directory.phoneE164 ? { sms: directory.phoneE164 } : {}),
          ...(whatsAppConsent ? { whatsapp: whatsAppConsent.phoneE164 } : {}),
        },
      };
    },
  };
}
