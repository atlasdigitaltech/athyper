variable "environment" {
  description = "Isolated Athyper environment. STG and production must use different AWS accounts."
  type        = string

  validation {
    condition     = contains(["stg", "production"], var.environment)
    error_message = "environment must be either stg or production."
  }
}

variable "expected_aws_account_id" {
  description = "AWS account that this environment is authorized to modify."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.expected_aws_account_id))
    error_message = "expected_aws_account_id must be a 12-digit AWS account ID."
  }
}

variable "aws_region" {
  description = "Primary SES region approved for this environment."
  type        = string

  validation {
    condition     = can(regex("^[a-z]{2}(-[a-z]+)+-[0-9]+$", var.aws_region))
    error_message = "aws_region must be a valid AWS region name."
  }
}

variable "identity_domain" {
  description = "Verified visible From domain, without a mailbox local part."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]*[a-z0-9]$", var.identity_domain))
    error_message = "identity_domain must be a lower-case DNS name."
  }
}

variable "mail_from_domain" {
  description = "Custom SES MAIL FROM/bounce domain. Must be a subdomain of identity_domain."
  type        = string
}

variable "from_address" {
  description = "Governed sender address permitted for the workload role."
  type        = string

  validation {
    condition     = can(regex("^[^@ ]+@[^@ ]+$", var.from_address))
    error_message = "from_address must be a single email address."
  }
}

variable "configuration_set_name" {
  description = "SES configuration set used by Athyper transactional delivery."
  type        = string
  default     = "athyper-transactional"
}

variable "sender_principal_arns" {
  description = "IAM principals allowed to assume the least-privilege SES sending role."
  type        = list(string)

  validation {
    condition     = length(var.sender_principal_arns) > 0 && alltrue([for arn in var.sender_principal_arns : can(regex("^arn:aws:iam::[0-9]{12}:(role|user)/", arn))])
    error_message = "Provide at least one IAM role/user ARN for the environment's delivery worker."
  }
}

variable "consumer_principal_arns" {
  description = "IAM principals allowed to assume the SES event-consumer role."
  type        = list(string)

  validation {
    condition     = length(var.consumer_principal_arns) > 0 && alltrue([for arn in var.consumer_principal_arns : can(regex("^arn:aws:iam::[0-9]{12}:(role|user)/", arn))])
    error_message = "Provide at least one IAM role/user ARN for the environment's event consumer."
  }
}

variable "event_retention_seconds" {
  description = "Retention for unprocessed SES delivery events."
  type        = number
  default     = 1209600

  validation {
    condition     = var.event_retention_seconds >= 86400 && var.event_retention_seconds <= 1209600
    error_message = "event_retention_seconds must be between 1 and 14 days."
  }
}

variable "max_receive_count" {
  description = "Consumer failures allowed before an SES event moves to the DLQ."
  type        = number
  default     = 5

  validation {
    condition     = var.max_receive_count >= 2 && var.max_receive_count <= 20
    error_message = "max_receive_count must be between 2 and 20."
  }
}

variable "dmarc_rua_address" {
  description = "Approved aggregate DMARC report mailbox. Emitted as DNS guidance only."
  type        = string
}

variable "tags" {
  description = "Additional non-secret resource tags."
  type        = map(string)
  default     = {}
}
