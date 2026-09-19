terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.90"
    }
  }

  # Supply the environment-specific bucket, key, region, and lock settings to
  # `terraform init -backend-config=...`. Local state is not an approved target.
  backend "s3" {}
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge(var.tags, {
      Environment = var.environment
      ManagedBy   = "terraform"
      Service     = "athyper-notifications"
    })
  }
}
