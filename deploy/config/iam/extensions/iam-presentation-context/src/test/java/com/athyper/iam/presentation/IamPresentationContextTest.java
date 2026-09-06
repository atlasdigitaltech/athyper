package com.athyper.iam.presentation;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class IamPresentationContextTest {
    private static final long NOW = 1_750_000_000L;

    @Test
    void acceptsContextBoundToTheCurrentAuthenticationTransaction() {
        var context = context("neon", "athyper", "neon-web", "athq.admin", "  Athq   Admin  ", NOW - 5, NOW + 55);

        assertEquals("Athq Admin", context.validatedDisplayName(
                "athyper", "neon-web", "neon", "ATHQ.ADMIN", Instant.ofEpochSecond(NOW)));
    }

    @Test
    void rejectsClientPlaneLoginHintAndExpiryMismatches() {
        var valid = context("mesh", "athyper", "mesh-web", "athq.mesh.owner", "Mesh Owner", NOW - 5, NOW + 55);

        assertNull(valid.validatedDisplayName("athyper", "neon-web", "mesh", "athq.mesh.owner", Instant.ofEpochSecond(NOW)));
        assertNull(valid.validatedDisplayName("athyper", "mesh-web", "neon", "athq.mesh.owner", Instant.ofEpochSecond(NOW)));
        assertNull(valid.validatedDisplayName("athyper", "mesh-web", "mesh", "someone.else", Instant.ofEpochSecond(NOW)));
        assertNull(valid.validatedDisplayName("athyper", "mesh-web", "mesh", "athq.mesh.owner", Instant.ofEpochSecond(NOW + 56)));
    }

    @Test
    void rejectsContextsWhoseLifetimeExceedsTheContract() {
        var context = context("admin", "athyper", "admin-web", "athq.admin", "Athq Admin", NOW, NOW + 121);
        assertNull(context.validatedDisplayName("athyper", "admin-web", "admin", "athq.admin", Instant.ofEpochSecond(NOW)));
    }

    private static IamPresentationContext context(
            String plane,
            String realm,
            String clientId,
            String loginHint,
            String displayName,
            long createdAt,
            long expiresAt) {
        return new IamPresentationContext(
                1,
                plane,
                realm,
                clientId,
                loginHint,
                displayName,
                "Athyper Group Holdings",
                createdAt,
                expiresAt);
    }
}
