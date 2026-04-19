<#-- ============================================================
     Athyper Neon Email Theme — password-reset.ftl (Plain Text)
     ============================================================ -->
ATHYPER ADMIN — PASSWORD RESET
─────────────────────────────────────────────

Hi ${user.firstName!""} ${user.lastName!""},

Name     : ${user.firstName!""} ${user.lastName!""}
Username : ${user.username}
<#if (user.attributes['org_name']?has_content)!false>
Org      : ${user.attributes['org_name']}
</#if>
Tenant   : ${realmName}

We received a request to reset the password for your Athyper account
(${user.email}).

Click or copy the link below to set a new password:

  ${link}

⚠  This link expires in ${linkExpiration} minutes.
   After that, return to the sign-in page and request a new reset link.

─────────────────────────────────────────────
DIDN'T REQUEST THIS?

If you did not ask for a password reset, your account is still secure.
Someone may have entered your email address by mistake.
Your password will not change until you use the link above.

─────────────────────────────────────────────
© ${.now?string("yyyy")} Athyper. All rights reserved.
Questions? manoj.rajendran@atlasdigitaltech.com
