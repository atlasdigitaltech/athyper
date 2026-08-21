package com.athyper.iam.presentation;

import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.authenticators.conditional.ConditionalAuthenticator;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.protocol.oidc.OIDCLoginProtocol;
import org.keycloak.sessions.AuthenticationSessionModel;

/**
 * Enables the user-plane MFA subflow only for an explicit fresh step-up
 * transaction. The BFF represents that transaction with the standard OIDC
 * max_age=0 parameter after resolving an organization policy that requires
 * Athyper MFA.
 */
final class IamMfaStepUpCondition implements ConditionalAuthenticator {
    static final IamMfaStepUpCondition SINGLETON = new IamMfaStepUpCondition();

    private IamMfaStepUpCondition() {
    }

    @Override
    public boolean matchCondition(AuthenticationFlowContext context) {
        AuthenticationSessionModel authSession = context.getAuthenticationSession();
        return authSession != null
                && isFreshStepUp(authSession.getClientNote(OIDCLoginProtocol.MAX_AGE_PARAM));
    }

    static boolean isFreshStepUp(String maxAge) {
        return maxAge != null && "0".equals(maxAge.trim());
    }

    @Override
    public void action(AuthenticationFlowContext context) {
        // Conditional authenticators do not render or process an action.
    }

    @Override
    public boolean requiresUser() {
        return false;
    }

    @Override
    public void setRequiredActions(KeycloakSession session, RealmModel realm, UserModel user) {
        // The OTP authenticator owns CONFIGURE_TOTP enrollment.
    }

    @Override
    public void close() {
        // Singleton has no resources.
    }
}
