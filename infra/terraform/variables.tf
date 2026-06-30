variable "aws_region" {
  description = "AWS region for the future deployment."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Logical project name used for tagging and naming."
  type        = string
  default     = "fleet-telemetry"
}

variable "environment" {
  description = "Target environment name."
  type        = string
  default     = "dev"
}

variable "tags" {
  description = "Extra tags applied to all future resources."
  type        = map(string)
  default     = {}
}

variable "vpc_cidr" {
  description = "CIDR range for the application VPC."
  type        = string
  default     = "10.50.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR ranges for public subnets."
  type        = list(string)
  default     = ["10.50.101.0/24", "10.50.102.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR ranges for private subnets."
  type        = list(string)
  default     = ["10.50.1.0/24", "10.50.2.0/24"]
}

variable "service_discovery_namespace" {
  description = "Private DNS namespace used by ECS service discovery."
  type        = string
  default     = "fleet.local"
}

variable "image_tag" {
  description = "ECR image tag to deploy for backend and worker."
  type        = string
  default     = "latest"
}

variable "mq_broker_username" {
  description = "RabbitMQ broker username managed by Amazon MQ."
  type        = string
  default     = "fleet"
}

variable "mq_broker_password" {
  description = "RabbitMQ broker password managed by Amazon MQ."
  type        = string
  sensitive   = true
}

variable "mq_engine_version" {
  description = "Amazon MQ RabbitMQ engine version for the managed broker."
  type        = string
  default     = "3.13.0"
}

variable "mq_host_instance_type" {
  description = "Amazon MQ host instance type used for the managed broker."
  type        = string
  default     = "mq.t3.micro"
}

variable "mq_deployment_mode" {
  description = "Deployment mode for the RabbitMQ broker."
  type        = string
  default     = "SINGLE_INSTANCE"
}

variable "agent_mock" {
  description = "Enable mock mode for the backend agent."
  type        = bool
  default     = true
}

variable "openai_api_key" {
  description = "OpenAI API key for the agent runtime."
  type        = string
  sensitive   = true
  default     = ""
}

variable "db_name" {
  description = "Database name for the telemetry store."
  type        = string
  default     = "fleet"
}

variable "db_username" {
  description = "Master username for the database."
  type        = string
  default     = "fleet"
}

variable "db_password" {
  description = "Master password for the database."
  type        = string
  sensitive   = true
}

variable "db_instance_class" {
  description = "RDS instance class for the base database."
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "Initial allocated storage for the database in GiB."
  type        = number
  default     = 20
}

variable "db_backup_retention_period" {
  description = "Backup retention period in days."
  type        = number
  default     = 7
}

variable "db_skip_final_snapshot" {
  description = "Skip the final snapshot when destroying the database."
  type        = bool
  default     = true
}
