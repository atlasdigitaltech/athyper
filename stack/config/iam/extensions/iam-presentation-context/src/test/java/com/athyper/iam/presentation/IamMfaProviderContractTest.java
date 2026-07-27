package com.athyper.iam.presentation;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

final class IamMfaProviderContractTest {
    @Test
    void otpProviderAllowsFirstTimeCredentialSetup() {
        assertTrue(new IamPresentationOtpFormFactory().isUserSetupAllowed());
    }

    @Test
    void freshStepUpConditionMatchesOnlyZeroMaxAge() {
        assertTrue(IamMfaStepUpCondition.isFreshStepUp("0"));
        assertTrue(IamMfaStepUpCondition.isFreshStepUp(" 0 "));
        assertFalse(IamMfaStepUpCondition.isFreshStepUp(null));
        assertFalse(IamMfaStepUpCondition.isFreshStepUp(""));
        assertFalse(IamMfaStepUpCondition.isFreshStepUp("3600"));
    }

    @Test
    void otpGreetingFallsBackToAuthenticatedKeycloakProfile() {
        assertEquals(
                "CATL Admin",
                IamPresentationOtpForm.authenticatedDisplayName("CATL", "Admin", "catl.admin"));
        assertEquals(
                "catl.admin",
                IamPresentationOtpForm.authenticatedDisplayName(null, null, "catl.admin"));
    }
}
