provider "aws" {
  region = var.aws_region
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    },
    var.tags
  )

  az_count = max(length(var.public_subnet_cidrs), length(var.private_subnet_cidrs))
}

data "aws_availability_zones" "available" {
  state = "available"
}

# Base AWS real minima para el portal corporativo.
# Incluye red, almacenamiento, ECR, ECS/Fargate, service discovery y balanceo de entrada.
