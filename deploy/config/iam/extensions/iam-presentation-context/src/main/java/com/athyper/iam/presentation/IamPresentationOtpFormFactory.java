package com.athyper.iam.presentation;

import org.keycloak.Config;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.AuthenticatorFactory;
import org.keycloak.models.AuthenticationExecutionModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.provider.ProviderConfigProperty;

import java.util.List;

public final class IamPresentationOtpFormFactory implements AuthenticatorFactory {
    public static final String PROVIDER_ID = "athyper-iam-otp-form";

    @Override
    public Authenticator create(KeycloakSession session) {
        return new IamPresentationOtpForm(session);
    }

    @Override
    public void init(Config.Scope config) {
        // No-op. The validated display name is already held in the authentication session.
    }

    @Override
    public void postInit(KeycloakSessionFactory factory) {
        // No-op.
    }

    @Override
    public void close() {
        // No-op.
    }

    @Override
    public String getId() {
        return PROVIDER_ID;
    }

    @Override
    public String getReferenceCategory() {
        return "otp";
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
        return "Athyper OTP form with trusted presentation context";
    }

    @Override
    public String getHelpText() {
        return "Validates OTP and carries the server-validated display name into the OTP login theme.";
    }

    @Override
    public List<ProviderConfigProperty> getConfigProperties() {
        return List.of();
    }

    @Override
    public boolean isUserSetupAllowed() {
        // Match Keycloak's stock OTP factory. When an OTP execution is
        // required and the user has no OTP credential yet, Keycloak must be
        // allowed to schedule CONFIGURE_TOTP and resume the original login
        // transaction after enrollment.
        return true;
    }
}
