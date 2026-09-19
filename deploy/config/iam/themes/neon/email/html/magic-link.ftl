<#-- ============================================================
     Athyper Neon Email Theme — magic-link.ftl (HTML)
     Triggered by: Magic Link / passwordless sign-in flow
     Variables: link, linkExpiration, realmName,
                user.firstName, user.lastName, user.email
     ============================================================ -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <!--[if mso]>
  <noscript>
    <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  </noscript>
  <![endif]-->
  <title>Your Athyper sign-in link</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;">

  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f5f5f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- ── Card ── -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:8px;border:1px solid #e5e5e5;box-shadow:0 1px 3px rgba(0,0,0,0.06);">

          <!-- ── Header bar ── -->
          <tr>
            <td style="background-color:#1c1c1c;border-radius:8px 8px 0 0;padding:28px 40px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="28" height="28" style="display:inline-block;vertical-align:middle;" aria-hidden="true">
                      <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>
                    </svg>
                    <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-size:18px;font-weight:600;color:#ffffff;letter-spacing:-0.02em;">Athyper Admin</span>
                  </td>
                  <td align="right">
                    <!-- Zap badge -->
                    <span style="display:inline-block;font-size:11px;color:rgba(255,255,255,0.55);letter-spacing:0.06em;text-transform:uppercase;">
                      Magic Link
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Decorative zap row ── -->
          <tr>
            <td align="center" style="padding:36px 40px 0;">
              <div style="display:inline-block;background:#f4f4f4;border-radius:50%;width:56px;height:56px;line-height:56px;text-align:center;">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#1c1c1c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" style="vertical-align:middle;" aria-hidden="true">
                  <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>
                </svg>
              </div>
            </td>
          </tr>

          <!-- ── Body ── -->
          <tr>
            <td style="padding:24px 40px 32px;">

              <p style="margin:0 0 8px;font-size:22px;font-weight:600;color:#111111;letter-spacing:-0.02em;text-align:center;">
                Your sign-in link is ready
              </p>
              <p style="margin:0 0 28px;font-size:14px;color:#6b6b6b;line-height:1.7;text-align:center;">
                Hi <strong>${user.firstName!""} ${user.lastName!""}</strong>,<br/>
                Click the button below to sign in to Athyper instantly — no password required.
                This link is tied to <a href="mailto:${user.email}" style="color:#555555;text-decoration:none;">${user.email}</a>.
              </p>

              <!-- Organization / Tenant context -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:20px;">
                <tr>
                  <td style="background-color:#f4f8ff;border:1px solid #dce8fb;border-radius:6px;padding:12px 16px;">
                    <p style="margin:0;font-size:12px;color:#555555;line-height:1.8;text-align:center;">
                      <strong style="color:#333333;">Name:</strong>&nbsp;${user.firstName!""} ${user.lastName!""}&emsp;
                      <strong style="color:#333333;">Username:</strong>&nbsp;${user.username}<br/>
                      <#if (user.attributes['org_name']?has_content)!false>
                      <strong style="color:#333333;">Organization:</strong>&nbsp;${user.attributes['org_name']}&emsp;
                      </#if>
                      <strong style="color:#333333;">Tenant:</strong>&nbsp;${realmName}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding-bottom:28px;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                      href="${link}" style="height:44px;v-text-anchor:middle;width:220px;" arcsize="11%"
                      strokecolor="#1c1c1c" fillcolor="#1c1c1c">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:sans-serif;font-size:14px;font-weight:600;">Sign in to Athyper</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${link}" target="_blank"
                      style="display:inline-block;padding:13px 36px;background-color:#1c1c1c;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;letter-spacing:0.01em;">
                      Sign in to Athyper
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>

              <!-- Expiry + single-use notice -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="background-color:#fafafa;border:1px solid #e5e5e5;border-radius:6px;padding:16px 18px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="padding:4px 0;font-size:12px;color:#555555;line-height:1.7;">
                          <strong>Expiry:</strong> ${linkExpiration} minutes from when this email was sent.
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;font-size:12px;color:#555555;line-height:1.7;">
                          <strong>Security:</strong> Single-use only — the link becomes invalid after one click.
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:4px 0;font-size:12px;color:#555555;line-height:1.7;">
                          <strong>Device:</strong> Only valid for the device and browser you used to request it.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Fallback URL -->
              <p style="margin:24px 0 0;font-size:12px;color:#9b9b9b;line-height:1.6;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:6px 0 0;font-size:11px;word-break:break-all;">
                <a href="${link}" target="_blank" style="color:#555555;text-decoration:underline;">${link}</a>
              </p>

            </td>
          </tr>

          <!-- ── Security warning ── -->
          <tr>
            <td style="border-top:1px solid #f0f0f0;padding:20px 40px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="vertical-align:top;padding-right:12px;width:20px;">
                    <!-- Shield icon -->
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#9b9b9b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true" style="margin-top:1px;">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                  </td>
                  <td>
                    <p style="margin:0;font-size:12px;color:#9b9b9b;line-height:1.7;">
                      <strong style="color:#6b6b6b;">Security reminder</strong><br/>
                      Never share this link with anyone, including Athyper support.
                      We will never ask for your sign-in link.
                      If you did not request this, your account is secure — simply ignore this email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Didn't request this ── -->
          <tr>
            <td style="border-top:1px solid #f0f0f0;padding:16px 40px;background-color:#fffbf0;">
              <p style="margin:0;font-size:12px;color:#9b9b9b;line-height:1.7;">
                <strong style="color:#6b6b6b;">Didn't request this?</strong><br/>
                If you didn't ask to sign in, someone may have entered your email address by mistake.
                Your account remains secure — this link will expire on its own.
                If you're concerned, contact us at
                <a href="mailto:manoj.rajendran@atlasdigitaltech.com" style="color:#6b6b6b;">manoj.rajendran@atlasdigitaltech.com</a>.
              </p>
            </td>
          </tr>

          <!-- ── Footer ── -->
          <tr>
            <td style="background-color:#fafafa;border-top:1px solid #f0f0f0;border-radius:0 0 8px 8px;padding:20px 40px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td>
                    <p style="margin:0;font-size:11px;color:#b0b0b0;line-height:1.6;">
                      &copy; ${.now?string("yyyy")} Athyper. All rights reserved.<br/>
                      This email was sent to <a href="mailto:${user.email}" style="color:#b0b0b0;">${user.email}</a>
                      because a sign-in link was requested for this address.
                    </p>
                  </td>
                  <td align="right" style="vertical-align:bottom;">
                    <p style="margin:0;font-size:10px;color:#cccccc;">
                      Powered by&nbsp;<strong style="color:#9b9b9b;">Athyper Platform</strong>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table><!-- /.card -->

        <p style="margin:20px 0 0;font-size:11px;color:#b0b0b0;text-align:center;">
          Questions? Contact us at
          <a href="mailto:manoj.rajendran@atlasdigitaltech.com" style="color:#9b9b9b;">manoj.rajendran@atlasdigitaltech.com</a>
        </p>

      </td>
    </tr>
  </table>

</body>
</html>
