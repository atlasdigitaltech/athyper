package com.athyper.iam.presentation;

import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.MultivaluedMap;
import org.jboss.logging.Logger;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.authenticators.browser.UsernamePasswordForm;
import org.keycloak.forms.login.LoginFormsProvider;
import org.keycloak.models.ClientModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.protocol.oidc.OIDCLoginProtocol;
import org.keycloak.sessions.AuthenticationSessionModel;

import java.time.Instant;

final class IamPresentationUsernamePasswordForm extends UsernamePasswordForm {
    static final String TEMPLATE_ATTRIBUTE = "iamPresentationDisplayName";
    static final String DISPLAY_NAME_AUTH_NOTE = "athyper.iam.presentation.display_name";
    private static final Logger LOG = Logger.getLogger(IamPresentationUsernamePasswordForm.class);

    private final KeycloakSession keycloakSession;
    private final RedisPresentationContextStore store;
    private String displayName;

    IamPresentationUsernamePasswordForm(KeycloakSession session, RedisPresentationContextStore store) {
        super(session);
        this.keycloakSession = session;
        this.store = store;
    }

    @Override
    public void authenticate(AuthenticationFlowContext context) {
        resolvePresentationContext(context);
        super.authenticate(context);
    }

    @Override
    public void action(AuthenticationFlowContext context) {
        resolvePresentationContext(context);
        super.action(context);
    }

    @Override
    protected Response createLoginForm(LoginFormsProvider form) {
        applyPresentationAttribute(form);
        return super.createLoginForm(form);
    }

    @Override
    protected Response challenge(AuthenticationFlowContext context, MultivaluedMap<String, String> formData) {
        LoginFormsProvider form = context.form();
        applyPresentationAttribute(form);
        if (!formData.isEmpty()) form.setFormData(formData);
        return form.createLoginUsernamePassword();
    }

    private void applyPresentationAttribute(LoginFormsProvider form) {
        String trustedDisplayName = displayName;
        if (trustedDisplayName == null) {
            AuthenticationSessionModel authSession = keycloakSession.getContext().getAuthenticationSession();
            if (authSession != null) {
                trustedDisplayName = IamPresentationContext.normalizeLabel(
                        authSession.getAuthNote(DISPLAY_NAME_AUTH_NOTE),
                        120);
            }
        }
        if (trustedDisplayName != null) {
            form.setAttribute(TEMPLATE_ATTRIBUTE, trustedDisplayName);
            LOG.debug("iam_presentation_context_applied");
        }
    }

    private void resolvePresentationContext(AuthenticationFlowContext context) {
        AuthenticationSessionModel authSession = context.getAuthenticationSession();
        displayName = IamPresentationContext.normalizeLabel(authSession.getAuthNote(DISPLAY_NAME_AUTH_NOTE), 120);
        if (displayName != null || store == null) return;

        String state = authSession.getClientNote(OIDCLoginProtocol.STATE_PARAM);
        String loginHint = authSession.getClientNote(OIDCLoginProtocol.LOGIN_HINT_PARAM);
        ClientModel client = authSession.getClient();
        String expectedPlane = client == null ? null : client.getAttribute("plane");
        String expectedClientId = client == null ? null : client.getClientId();
        if (state == null || loginHint == null || expectedPlane == null || expectedClientId == null) return;

        try {
            IamPresentationContext presentation = store.consume(state);
            if (presentation == null) return;
            String validatedName = presentation.validatedDisplayName(
                    context.getRealm().getName(),
                    expectedClientId,
                    expectedPlane,
                    loginHint,
                    Instant.now());
            if (validatedName == null) {
                LOG.warnf("iam_presentation_context_rejected client=%s plane=%s", expectedClientId, expectedPlane);
                return;
            }
            displayName = validatedName;
            authSession.setAuthNote(DISPLAY_NAME_AUTH_NOTE, validatedName);
            LOG.debugf("iam_presentation_context_accepted client=%s plane=%s", expectedClientId, expectedPlane);
        } catch (Exception error) {
            // This is presentation-only context. Authentication deliberately
            // remains available with the generic greeting when Redis is down.
            LOG.warnf("iam_presentation_context_unavailable client=%s plane=%s reason=%s",
                    expectedClientId, expectedPlane, error.getClass().getSimpleName());
        }
    }
}
