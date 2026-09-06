<#-- ============================================================
     Athyper Neon Email Theme — magic-link.ftl (Plain Text)
     ============================================================ -->
ATHYPER ADMIN — YOUR SIGN-IN LINK
─────────────────────────────────────────────

Hi ${user.firstName!""} ${user.lastName!""},

Name     : ${user.firstName!""} ${user.lastName!""}
Username : ${user.username}
<#if (user.attributes['org_name']?has_content)!false>
Org      : ${user.attributes['org_name']}
</#if>
Tenant   : ${realmName}

Click or copy the link below to sign in to Athyper instantly.
No password required.

  ${link}

─────────────────────────────────────────────
IMPORTANT — PLEASE READ

  Expiry: This link expires in ${linkExpiration} minutes.
  Security: Single-use only — it becomes invalid after one click.
  Device: Only valid for the device/browser used to request it.

NEVER share this link with anyone, including Athyper support.
We will never ask for your sign-in link.

─────────────────────────────────────────────
DIDN'T REQUEST THIS?

If you did not ask to sign in to Athyper, you can safely ignore this
email. Your account is secure. This link will expire automatically.

If you're concerned, contact us:
  manoj.rajendran@atlasdigitaltech.com

─────────────────────────────────────────────
© ${.now?string("yyyy")} Athyper. All rights reserved.
This email was sent to ${user.email}.
