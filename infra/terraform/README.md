# Terraform AWS base

Este directorio contiene la base minima de IaC con Terraform para AWS.

Objetivo de esta base:
- fijar el proveedor y la version minima de Terraform
- crear una VPC con subredes publicas y privadas
- desplegar una base PostgreSQL administrada como capa lista para TimescaleDB
- levantar un broker RabbitMQ administrado en AWS con Amazon MQ
- publicar una imagen en ECR y orquestar backend y worker con ECS/Fargate
- registrar el worker en service discovery para que el backend lo invoque por URL interna

Uso esperado:
```bash
cd infra/terraform
terraform init -backend-config=backend.hcl
terraform validate
```

Antes de `apply`, completa un `terraform.tfvars` a partir de `terraform.tfvars.example` y define las credenciales del broker RabbitMQ y la base de datos.

El backend y el worker comparten la misma imagen ECR construida desde [backend/Dockerfile.ecs](/D:/Github/Fullstack_Engineer/backend/Dockerfile.ecs), cambiando solo el comando del contenedor.

Docker Compose sigue siendo la ruta local reproducible. Terraform queda como la ruta AWS minima y declarativa, con Amazon MQ como broker administrado.

La pipeline `./.github/workflows/ecr-publish.yml` construye `backend/Dockerfile.ecs` y publica la imagen en ECR con tags `latest` y `sha`; necesita el secreto `AWS_ROLE_TO_ASSUME` y usa `fleet-telemetry-dev` como repositorio por defecto.

La workflow `./.github/workflows/deploy-terraform.yml` toma el tag generado por el build, ejecuta `terraform apply` y asume estado remoto en S3 con lock en DynamoDB. Usa por defecto los mismos nombres creados por el bootstrap, y solo requiere credenciales para AWS, RabbitMQ y la base de datos.

Si vas a usar el flujo manual, el archivo `backend.hcl.example` te deja listo el backend remoto para copiarlo como `backend.hcl` antes del primer `terraform init`.
