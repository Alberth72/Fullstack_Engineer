resource "aws_security_group" "mq_broker" {
  name        = "${local.name_prefix}-mq"
  description = "Access to the managed RabbitMQ broker from ECS tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5671
    to_port         = 5671
    protocol        = "tcp"
    security_groups = [aws_security_group.backend_tasks.id, aws_security_group.worker_tasks.id]
  }

  ingress {
    from_port       = 5672
    to_port         = 5672
    protocol        = "tcp"
    security_groups = [aws_security_group.backend_tasks.id, aws_security_group.worker_tasks.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_mq_broker" "main" {
  broker_name        = "${local.name_prefix}-rabbitmq"
  engine_type        = "RabbitMQ"
  engine_version     = var.mq_engine_version
  host_instance_type = var.mq_host_instance_type
  deployment_mode    = var.mq_deployment_mode

  publicly_accessible = false
  security_groups     = [aws_security_group.mq_broker.id]
  subnet_ids          = [values(aws_subnet.private)[0].id]
  apply_immediately   = true

  user {
    username       = var.mq_broker_username
    password       = var.mq_broker_password
    console_access = true
  }

  logs {
    general = true
  }

  maintenance_window_start_time {
    day_of_week = "MONDAY"
    time_of_day = "02:00"
    time_zone   = "UTC"
  }

  tags = local.common_tags
}

locals {
  rabbitmq_url = format(
    "amqps://%s:%s@%s",
    urlencode(var.mq_broker_username),
    urlencode(var.mq_broker_password),
    aws_mq_broker.main.instances[0].endpoints[0],
  )
}
