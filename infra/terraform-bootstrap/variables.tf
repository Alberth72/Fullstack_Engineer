variable "aws_region" {
  description = "AWS region where the Terraform state backend will live."
  type        = string
  default     = "us-east-1"
}

variable "state_bucket_name" {
  description = "S3 bucket name used for Terraform remote state."
  type        = string
  default     = "fleet-telemetry-tfstate"
}

variable "lock_table_name" {
  description = "DynamoDB table name used for Terraform state locking."
  type        = string
  default     = "fleet-telemetry-tf-locks"
}

variable "tags" {
  description = "Extra tags applied to bootstrap resources."
  type        = map(string)
  default     = {}
}
