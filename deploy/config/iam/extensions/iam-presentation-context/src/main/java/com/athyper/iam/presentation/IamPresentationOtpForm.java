package com.athyper.iam.presentation;

import jakarta.ws.rs.core.Response;
import org.jboss.logging.Logger;
import org.keycloak.authentication.authenticators.browser.OTPFormAuthenticator;
import org.keycloak.forms.login.LoginFormsProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.UserModel;
import org.keycloak.sessions.AuthenticationSessionModel;

final class IamPresentationOtpForm extends OTPFormAuthenticator {
    private static final Logger LOG = Logger.getLogger(IamPresentationOtpForm.class);

    private final KeycloakSession keycloakSession;

    IamPresentationOtpForm(KeycloakSession keycloakSession) {
        this.keycloakSession = keycloakSession;
    }

    @Override
    protected Response createLoginForm(LoginFormsProvider form) {
        AuthenticationSessionModel authSession = keycloakSession.getContext().getAuthenticationSession();
        if (authSession != null) {
            String trustedDisplayName = IamPresentationContext.normalizeLabel(
                    authSession.getAuthNote(IamPresentationUsernamePasswordForm.DISPLAY_NAME_AUTH_NOTE),
                    120);
            if (trustedDisplayName == null) {
                // OTP runs only after Keycloak has authenticated the identity.
                // Use that server-owned profile as a safe fallback when a fresh
                // authentication session no longer carries presentation context.
                trustedDisplayName = authenticatedDisplayName(authSession.getAuthenticatedUser());
            }
            if (trustedDisplayName != null) {
                form.setAttribute(IamPresentationUsernamePasswordForm.TEMPLATE_ATTRIBUTE, trustedDisplayName);
                LOG.debug("iam_presentation_context_applied_to_otp");
            }
        }
        return super.createLoginForm(form);
    }

    static String authenticatedDisplayName(UserModel user) {
        if (user == null) return null;
        return authenticatedDisplayName(user.getFirstName(), user.getLastName(), user.getUsername());
    }

    static String authenticatedDisplayName(String firstName, String lastName, String username) {
        String fullName = ((firstName == null ? "" : firstName)
                + " "
                + (lastName == null ? "" : lastName)).trim();
        String displayName = IamPresentationContext.normalizeLabel(fullName, 120);
        return displayName != null
                ? displayName
                : IamPresentationContext.normalizeLabel(username, 120);
    }
}
