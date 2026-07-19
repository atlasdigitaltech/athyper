package com.athyper.iam.presentation;

import java.time.Instant;
import java.util.Locale;
import java.util.Set;

record IamPresentationContext(
        int version,
        String planeKey,
        String realm,
        String clientId,
        String loginHint,
        String accountDisplayName,
        String organizationName,
        long createdAt,
        long expiresAt) {

    private static final Set<String> PLANES = Set.of("neon", "mesh", "admin");

    String validatedDisplayName(
            String expectedRealm,
            String expectedClientId,
            String expectedPlane,
            String expectedLoginHint,
            Instant now) {
        if (version != 1
                || !constantValue(realm, expectedRealm)
                || !constantValue(clientId, expectedClientId)
                || !constantValue(planeKey, expectedPlane)
                || !constantValue(normalizeLoginHint(loginHint), normalizeLoginHint(expectedLoginHint))
                || !PLANES.contains(normalizePlane(planeKey))
                || createdAt <= 0
                || expiresAt <= createdAt
                || expiresAt <= now.getEpochSecond()
                || expiresAt - createdAt > 120) {
            return null;
        }
        return normalizeLabel(accountDisplayName, 120);
    }

    private static boolean constantValue(String actual, String expected) {
        return actual != null && expected != null && actual.equals(expected);
    }

    private static String normalizePlane(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private static String normalizeLoginHint(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    static String normalizeLabel(String value, int maxLength) {
        if (value == null) return null;
        String normalized = value
                .replaceAll("[\\x00-\\x1F\\x7F]", " ")
                .trim()
                .replaceAll("\\s+", " ");
        return normalized.isEmpty() || normalized.length() > maxLength ? null : normalized;
    }
}
