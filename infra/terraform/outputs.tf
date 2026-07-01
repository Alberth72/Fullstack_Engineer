output "aws_region" {
  description = "Configured AWS region."
  value       = var.aws_region
}

output "project_name" {
  description = "Project name used by the Terraform base."
  value       = var.project_name
}

output "common_tags" {
  description = "Merged tags for future AWS resources."
  value       = local.common_tags
}

output "vpc_id" {
  description = "ID of the application VPC."
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets."
  value       = values(aws_subnet.public)[*].id
}

output "private_subnet_ids" {
  description = "IDs of the private subnets."
  value       = values(aws_subnet.private)[*].id
}

output "backend_repository_url" {
  description = "ECR repository URL used by backend and worker."
  value       = aws_ecr_repository.backend.repository_url
}

output "ecr_repository_name" {
  description = "ECR repository name used by backend, worker and frontend."
  value       = aws_ecr_repository.backend.name
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster."
  value       = aws_ecs_cluster.main.name
}

output "portal_url" {
  description = "Public URL of the frontend portal application load balancer."
  value       = "http://${aws_lb.backend.dns_name}"
}

output "backend_url" {
  description = "Public URL of the backend behind the shared application load balancer."
  value       = "http://${aws_lb.backend.dns_name}/api"
}

output "backend_health_url" {
  description = "Public health URL of the backend behind the shared application load balancer."
  value       = "http://${aws_lb.backend.dns_name}/health"
}

output "backend_internal_url" {
  description = "Internal DNS name used by private services to reach the backend."
  value       = local.backend_internal_url
}

output "worker_service_url" {
  description = "Internal DNS name used by the backend to reach the worker."
  value       = local.worker_url
}

output "rabbitmq_endpoint" {
  description = "Endpoint of the managed RabbitMQ broker."
  value       = aws_mq_broker.main.instances[0].endpoints[0]
}

output "rabbitmq_url" {
  description = "Internal RabbitMQ URL used by backend and worker."
  value       = local.rabbitmq_url
  sensitive   = true
}

output "database_address" {
  description = "Address of the managed PostgreSQL database."
  value       = aws_db_instance.main.address
}

output "database_port" {
  description = "Port of the managed PostgreSQL database."
  value       = aws_db_instance.main.port
}
