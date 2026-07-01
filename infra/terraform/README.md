# Terraform AWS base

Este directorio contiene la base minima de IaC con Terraform para AWS.

Objetivo de esta base:
- fijar el proveedor y la version minima de Terraform
- crear una VPC con subredes publicas y privadas
- desplegar una base PostgreSQL administrada como capa lista para TimescaleDB
- levantar un broker RabbitMQ administrado en AWS con Amazon MQ
- publicar imagenes en ECR y orquestar backend, worker y frontend con ECS/Fargate
- registrar el worker en service discovery para que el backend lo invoque por URL interna

Uso esperado:
```bash
cd infra/terraform
terraform init -backend-config=backend.hcl
terraform validate
```

Antes de `apply`, completa un `terraform.tfvars` a partir de `terraform.tfvars.example` y define las credenciales del broker RabbitMQ y la base de datos.

El backend y el worker comparten la misma imagen ECR construida desde [backend/Dockerfile.ecs](/D:/Github/Fullstack_Engineer/backend/Dockerfile.ecs), cambiando solo el comando del contenedor. El frontend usa una imagen independiente construida desde [frontend/Dockerfile](/D:/Github/Fullstack_Engineer/frontend/Dockerfile).

Docker Compose sigue siendo la ruta local reproducible. Terraform queda como la ruta AWS minima y declarativa, con Amazon MQ como broker administrado, ECS/Fargate para los tres servicios y un ALB compartido para portal, API y WebSocket.

La pipeline `./.github/workflows/ecr-publish.yml` corre despues de `project-ci` exitoso en `main`, construye `backend/Dockerfile.ecs` y `frontend/Dockerfile`, y publica imagenes en ECR con tags `latest` / `sha` para backend y `frontend-latest` / `frontend-sha` para frontend; necesita el secreto `AWS_ROLE_TO_ASSUME` y usa `fleet-telemetry-dev` como repositorio por defecto.

La workflow `./.github/workflows/deploy-terraform.yml` toma el tag generado por el build, ejecuta `terraform apply` y asume estado remoto en S3 con lock en DynamoDB. Usa por defecto los mismos nombres creados por el bootstrap, y solo requiere credenciales para AWS, RabbitMQ y la base de datos.

La guia completa de CD, validacion y rollback esta en [docs/continuous-deployment.md](/D:/Github/Fullstack_Engineer/docs/continuous-deployment.md).

Si vas a usar el flujo manual, el archivo `backend.hcl.example` te deja listo el backend remoto para copiarlo como `backend.hcl` antes del primer `terraform init`.
