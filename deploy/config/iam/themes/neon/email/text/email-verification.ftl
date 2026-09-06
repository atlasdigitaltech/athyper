<#-- ============================================================
     Athyper Neon Email Theme — email-verification.ftl (Plain Text)
     ============================================================ -->
ATHYPER ADMIN — VERIFY YOUR EMAIL ADDRESS
─────────────────────────────────────────────

Hi ${user.firstName!""} ${user.lastName!""},

Name     : ${user.firstName!""} ${user.lastName!""}
Username : ${user.username}
<#if (user.attributes['org_name']?has_content)!false>
Org      : ${user.attributes['org_name']}
</#if>
Tenant   : ${realmName}

Welcome to Athyper! Please verify that this email address belongs to you
by clicking or copying the link below:

  ${link}

Warning: This link expires in ${linkExpiration} minutes.
   If it has expired, sign in again — you'll be prompted to re-verify.

─────────────────────────────────────────────
WHAT HAPPENS NEXT?

- Your account is activated immediately after verification.
- You'll be redirected back to the platform automatically.
- Your data and settings are safe and waiting for you.

─────────────────────────────────────────────
DIDN'T SIGN UP?

If you didn't create an Athyper account, please ignore this email.
No account will be created without email verification.

─────────────────────────────────────────────
© ${.now?string("yyyy")} Athyper. All rights reserved.
Need help? manoj.rajendran@atlasdigitaltech.com
