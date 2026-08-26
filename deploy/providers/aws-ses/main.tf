data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

locals {
  name_prefix = "athyper-${var.environment}-notifications"
  identity_arn = format(
    "arn:%s:ses:%s:%s:identity/%s",
    data.aws_partition.current.partition,
    var.aws_region,
    data.aws_caller_identity.current.account_id,
    var.identity_domain,
  )
  configuration_set_arn = format(
    "arn:%s:ses:%s:%s:configuration-set/%s-%s",
    data.aws_partition.current.partition,
    var.aws_region,
    data.aws_caller_identity.current.account_id,
    var.configuration_set_name,
    var.environment,
  )
  default_event_bus_arn = format(
    "arn:%s:events:%s:%s:event-bus/default",
    data.aws_partition.current.partition,
    var.aws_region,
    data.aws_caller_identity.current.account_id,
  )
}

resource "terraform_data" "deployment_guard" {
  input = {
    environment = var.environment
    region      = var.aws_region
  }

  lifecycle {
    precondition {
      condition     = data.aws_caller_identity.current.account_id == var.expected_aws_account_id
      error_message = "Refusing deployment: active AWS account is not the approved account for this environment."
    }

    precondition {
      condition     = endswith(var.mail_from_domain, ".${var.identity_domain}")
      error_message = "mail_from_domain must be a subdomain of identity_domain."
    }

    precondition {
      condition     = endswith(var.from_address, "@${var.identity_domain}")
      error_message = "from_address must use identity_domain."
    }
  }
}

resource "aws_sesv2_email_identity" "transactional" {
  email_identity = var.identity_domain

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }

  depends_on = [terraform_data.deployment_guard]
}

resource "aws_sesv2_email_identity_mail_from_attributes" "transactional" {
  email_identity         = aws_sesv2_email_identity.transactional.email_identity
  mail_from_domain       = var.mail_from_domain
  behavior_on_mx_failure = "REJECT_MESSAGE"
}

resource "aws_sesv2_configuration_set" "transactional" {
  configuration_set_name = "${var.configuration_set_name}-${var.environment}"

  delivery_options {
    tls_policy = "REQUIRE"
  }

  reputation_options {
    reputation_metrics_enabled = true
  }

  sending_options {
    sending_enabled = true
  }

  suppression_options {
    suppressed_reasons = ["BOUNCE", "COMPLAINT"]
  }
}

resource "aws_sesv2_configuration_set_event_destination" "eventbridge" {
  configuration_set_name = aws_sesv2_configuration_set.transactional.configuration_set_name
  event_destination_name = "athyper-eventbridge"

  event_destination {
    enabled = true
    matching_event_types = [
      "SEND",
      "REJECT",
      "BOUNCE",
      "COMPLAINT",
      "DELIVERY",
      "RENDERING_FAILURE",
      "DELIVERY_DELAY",
      "SUBSCRIPTION",
    ]

    event_bridge_destination {
      # SES configuration-set destinations currently support only the default
      # EventBridge bus. The rule below scopes routing to SES events.
      event_bus_arn = local.default_event_bus_arn
    }
  }
}

resource "aws_sqs_queue" "ses_events_dlq" {
  name                      = "${local.name_prefix}-events-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled    = true
}

resource "aws_sqs_queue" "ses_events" {
  name                       = "${local.name_prefix}-events"
  message_retention_seconds  = var.event_retention_seconds
  visibility_timeout_seconds = 60
  sqs_managed_sse_enabled     = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.ses_events_dlq.arn
    maxReceiveCount     = var.max_receive_count
  })
}

resource "aws_sqs_queue_redrive_allow_policy" "ses_events_dlq" {
  queue_url = aws_sqs_queue.ses_events_dlq.id

  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.ses_events.arn]
  })
}

resource "aws_cloudwatch_event_rule" "ses_events" {
  name        = "${local.name_prefix}-events"
  description = "Route SES transactional delivery events to the Athyper durable consumer queue."

  event_pattern = jsonencode({
    source = ["aws.ses"]
    detail = {
      mail = {
        tags = {
          "ses:configuration-set" = [aws_sesv2_configuration_set.transactional.configuration_set_name]
        }
      }
    }
  })
}

resource "aws_cloudwatch_event_target" "ses_events" {
  rule      = aws_cloudwatch_event_rule.ses_events.name
  target_id = "athyper-ses-events"
  arn       = aws_sqs_queue.ses_events.arn
}

data "aws_iam_policy_document" "eventbridge_to_sqs" {
  statement {
    sid     = "AllowEventBridgeDelivery"
    effect  = "Allow"
    actions = ["sqs:SendMessage"]
    resources = [
      aws_sqs_queue.ses_events.arn,
    ]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_cloudwatch_event_rule.ses_events.arn]
    }
  }
}

resource "aws_sqs_queue_policy" "ses_events" {
  queue_url = aws_sqs_queue.ses_events.id
  policy    = data.aws_iam_policy_document.eventbridge_to_sqs.json
}

data "aws_iam_policy_document" "sender_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = var.sender_principal_arns
    }
  }
}

resource "aws_iam_role" "sender" {
  name               = "${local.name_prefix}-sender"
  assume_role_policy = data.aws_iam_policy_document.sender_assume_role.json
}

data "aws_iam_policy_document" "sender" {
  statement {
    sid       = "SendFromApprovedIdentity"
    effect    = "Allow"
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = [local.identity_arn, local.configuration_set_arn]

    condition {
      test     = "StringEquals"
      variable = "ses:FromAddress"
      values   = [var.from_address]
    }
  }

  statement {
    sid       = "ReadAccountSendingHealth"
    effect    = "Allow"
    actions   = ["ses:GetAccount"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "sender" {
  name   = "send-approved-transactional-email"
  role   = aws_iam_role.sender.id
  policy = data.aws_iam_policy_document.sender.json
}

data "aws_iam_policy_document" "consumer_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = var.consumer_principal_arns
    }
  }
}

resource "aws_iam_role" "consumer" {
  name               = "${local.name_prefix}-event-consumer"
  assume_role_policy = data.aws_iam_policy_document.consumer_assume_role.json
}

data "aws_iam_policy_document" "consumer" {
  statement {
    sid    = "ConsumeDeliveryEvents"
    effect = "Allow"
    actions = [
      "sqs:ChangeMessageVisibility",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:GetQueueUrl",
      "sqs:ReceiveMessage",
    ]
    resources = [aws_sqs_queue.ses_events.arn]
  }

  statement {
    sid     = "InspectDeadLetters"
    effect  = "Allow"
    actions = ["sqs:GetQueueAttributes", "sqs:GetQueueUrl"]
    resources = [
      aws_sqs_queue.ses_events_dlq.arn,
    ]
  }
}

resource "aws_iam_role_policy" "consumer" {
  name   = "consume-ses-delivery-events"
  role   = aws_iam_role.consumer.id
  policy = data.aws_iam_policy_document.consumer.json
}
