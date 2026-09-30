package com.athyper.iam.presentation;

import org.jboss.logging.Logger;
import org.keycloak.Config;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.AuthenticatorFactory;
import org.keycloak.models.AuthenticationExecutionModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.provider.ProviderConfigProperty;

import java.util.List;

public final class IamPresentationUsernamePasswordFormFactory implements AuthenticatorFactory {
    public static final String PROVIDER_ID = "athyper-iam-username-password-form";
    private static final Logger LOG = Logger.getLogger(IamPresentationUsernamePasswordFormFactory.class);

    private volatile RedisPresentationContextStore store;

    @Override
    public Authenticator create(KeycloakSession session) {
        return new IamPresentationUsernamePasswordForm(session, store);
    }

    @Override
    public void init(Config.Scope config) {
        String redisUrl = System.getenv("IAM_PRESENTATION_REDIS_URL");
        if (redisUrl == null || redisUrl.isBlank()) {
            LOG.warn("iam_presentation_context_disabled reason=IAM_PRESENTATION_REDIS_URL_missing");
            store = null;
            return;
        }
        try {
            store = new RedisPresentationContextStore(redisUrl);
            LOG.info("iam_presentation_context_enabled");
        } catch (RuntimeException error) {
            store = null;
            LOG.errorf("iam_presentation_context_disabled reason=%s", error.getClass().getSimpleName());
        }
    }

    @Override
    public void postInit(KeycloakSessionFactory factory) {
        // No-op. Redis connections are short-lived and opened only when a
        // presentation record exists for an authentication transaction.
    }

    @Override
    public void close() {
        store = null;
    }

    @Override
    public String getId() {
        return PROVIDER_ID;
    }

    @Override
    public String getReferenceCategory() {
        return "password";
    }

    @Override
    public boolean isConfigurable() {
        return false;
    }

    @Override
    public AuthenticationExecutionModel.Requirement[] getRequirementChoices() {
        return REQUIREMENT_CHOICES;
    }

    @Override
    public String getDisplayType() {
        return "Athyper username/password form with trusted presentation context";
    }

    @Override
    public String getHelpText() {
        return "Validates username/password and consumes a one-time, server-owned IAM presentation context for the login theme.";
    }

    @Override
    public List<ProviderConfigProperty> getConfigProperties() {
        return List.of();
    }

    @Override
    public boolean isUserSetupAllowed() {
        return false;
    }
}
