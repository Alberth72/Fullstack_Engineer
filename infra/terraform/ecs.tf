resource "aws_security_group" "backend_tasks" {
  name        = "${local.name_prefix}-backend-tasks"
  description = "Security group for the backend ECS tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 4001
    to_port         = 4001
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_security_group" "worker_tasks" {
  name        = "${local.name_prefix}-worker-tasks"
  description = "Security group for the worker ECS tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 4002
    to_port         = 4002
    protocol        = "tcp"
    security_groups = [aws_security_group.backend_tasks.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_ecs_cluster" "main" {
  name = local.name_prefix

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${local.name_prefix}/backend"
  retention_in_days = 14
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${local.name_prefix}/worker"
  retention_in_days = 14
  tags              = local.common_tags
}

locals {
  backend_image = "${aws_ecr_repository.backend.repository_url}:${var.image_tag}"
  worker_url    = "http://${aws_service_discovery_service.worker.name}.${aws_service_discovery_private_dns_namespace.main.name}:4002"

  backend_env = [
    {
      name  = "NODE_ENV"
      value = "production"
    },
    {
      name  = "PORT"
      value = "4001"
    },
    {
      name  = "DATABASE_URL"
      value = "postgres://${var.db_username}:${var.db_password}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${var.db_name}"
    },
    {
      name  = "RABBITMQ_URL"
      value = local.rabbitmq_url
    },
    {
      name  = "OUTBOX_WORKER_URL"
      value = local.worker_url
    },
    {
      name  = "AGENT_MOCK"
      value = tostring(var.agent_mock)
    },
    {
      name  = "OPENAI_API_KEY"
      value = var.openai_api_key
    },
  ]

  worker_env = [
    {
      name  = "NODE_ENV"
      value = "production"
    },
    {
      name  = "PORT"
      value = "4002"
    },
    {
      name  = "WORKER_PORT"
      value = "4002"
    },
    {
      name  = "DATABASE_URL"
      value = "postgres://${var.db_username}:${var.db_password}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${var.db_name}"
    },
    {
      name  = "RABBITMQ_URL"
      value = local.rabbitmq_url
    },
    {
      name  = "JSON_BODY_LIMIT"
      value = "2mb"
    }
  ]
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "${local.name_prefix}-backend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "backend"
      image     = local.backend_image
      essential = true
      portMappings = [
        {
          containerPort = 4001
          hostPort      = 4001
          protocol      = "tcp"
        }
      ]
      environment = local.backend_env
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.backend.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "backend"
        }
      }
    }
  ])
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.name_prefix}-worker"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "worker"
      image     = local.backend_image
      essential = true
      command   = ["npm", "run", "start:worker"]
      portMappings = [
        {
          containerPort = 4002
          hostPort      = 4002
          protocol      = "tcp"
        }
      ]
      environment = local.worker_env
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.worker.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "worker"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "backend" {
  name                              = "${local.name_prefix}-backend"
  cluster                           = aws_ecs_cluster.main.id
  task_definition                   = aws_ecs_task_definition.backend.arn
  desired_count                     = 1
  launch_type                       = "FARGATE"
  platform_version                  = "1.4.0"
  health_check_grace_period_seconds = 60
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = values(aws_subnet.private)[*].id
    security_groups  = [aws_security_group.backend_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 4001
  }

  depends_on = [
    aws_lb_listener.http,
    aws_db_instance.main,
    aws_service_discovery_service.worker
  ]

  tags = local.common_tags
}

resource "aws_ecs_service" "worker" {
  name             = "${local.name_prefix}-worker"
  cluster          = aws_ecs_cluster.main.id
  task_definition  = aws_ecs_task_definition.worker.arn
  desired_count    = 1
  launch_type      = "FARGATE"
  platform_version = "1.4.0"
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = values(aws_subnet.private)[*].id
    security_groups  = [aws_security_group.worker_tasks.id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn   = aws_service_discovery_service.worker.arn
    container_name = "worker"
    container_port = 4002
  }

  depends_on = [
    aws_db_instance.main
  ]

  tags = local.common_tags
}
