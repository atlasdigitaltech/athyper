output "ses" {
  description = "Non-secret application and operator references."
  value = {
    region                 = var.aws_region
    from_address           = var.from_address
    identity_arn           = local.identity_arn
    configuration_set_name = aws_sesv2_configuration_set.transactional.configuration_set_name
    event_bus_arn           = local.default_event_bus_arn
    event_queue_url         = aws_sqs_queue.ses_events.url
    event_queue_arn         = aws_sqs_queue.ses_events.arn
    event_dlq_url           = aws_sqs_queue.ses_events_dlq.url
    sender_role_arn         = aws_iam_role.sender.arn
    consumer_role_arn       = aws_iam_role.consumer.arn
  }
}

output "cloudflare_dns_records" {
  description = "Records an authorized DNS owner must create as DNS-only entries. Terraform does not modify Cloudflare."
  value = concat(
    [for token in aws_sesv2_email_identity.transactional.dkim_signing_attributes[0].tokens : {
      type    = "CNAME"
      name    = "${token}._domainkey.${var.identity_domain}"
      value   = "${token}.dkim.amazonses.com"
      proxied = false
    }],
    [
      {
        type    = "MX"
        name    = var.mail_from_domain
        value   = "10 feedback-smtp.${var.aws_region}.amazonses.com"
        proxied = false
      },
      {
        type    = "TXT"
        name    = var.mail_from_domain
        value   = "v=spf1 include:amazonses.com -all"
        proxied = false
      },
      {
        type    = "TXT"
        name    = "_dmarc.${var.identity_domain}"
        value   = "v=DMARC1; p=none; rua=mailto:${var.dmarc_rua_address}; adkim=s; aspf=s"
        proxied = false
      },
    ],
  )
}
