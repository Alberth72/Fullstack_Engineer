# Despliegue continuo

Esta guia describe el flujo de despliegue continuo del MVP en AWS.

## Flujo automatizado
1. `project-ci` corre en cada push y pull request.
2. Cuando `project-ci` termina correctamente en `main`, `build-push-ecr` construye y publica:
   - backend/worker desde `backend/Dockerfile.ecs`
   - frontend desde `frontend/Dockerfile`
3. Backend/worker se etiquetan con `latest` y con el SHA exacto del commit.
4. Frontend se etiqueta con `frontend-latest` y `frontend-<sha>`.
5. Cuando `build-push-ecr` termina correctamente, `deploy-terraform` ejecuta `terraform apply` con:
   - `image_tag=<sha>`
   - `frontend_image_tag=frontend-<sha>`
6. ECS/Fargate actualiza los servicios `backend`, `worker` y `frontend` con circuit breaker y rollback habilitado.

## Topologia desplegada
- Un Application Load Balancer publico sirve el portal en `/`.
- El mismo ALB enruta `/api`, `/health`, `/metrics` y `/ws` al backend.
- Backend, worker y frontend corren en subredes privadas.
- RabbitMQ se mantiene en Amazon MQ.
- La persistencia principal sigue siendo PostgreSQL administrado como base lista para TimescaleDB.
- Backend y worker comparten imagen; el worker cambia solo el comando del contenedor.
- El frontend usa `/api` y deriva el WebSocket desde el mismo host publico.

## Workflows
| Workflow | Proposito | Disparador |
| --- | --- | --- |
| `.github/workflows/ci.yml` | Pruebas, builds, Compose config y formato Terraform | push, pull_request |
| `.github/workflows/ecr-publish.yml` | Publica imagenes backend y frontend en ECR | `project-ci` exitoso en `main`, manual |
| `.github/workflows/deploy-terraform.yml` | Aplica Terraform con los tags publicados | `build-push-ecr` exitoso, manual |
| `.github/workflows/bootstrap-terraform-state.yml` | Crea bucket S3 y tabla DynamoDB para estado remoto | manual |

## Secretos requeridos
- `AWS_ROLE_TO_ASSUME`
- `MQ_BROKER_PASSWORD`
- `DB_PASSWORD`
- `OPENAI_API_KEY` opcional si `agent_mock` se mantiene en `true`

## Repositorios ECR
Terraform crea y gestiona `fleet-telemetry-dev` como repositorio ECR compartido:
- `latest` y `<sha>` para backend y worker
- `frontend-latest` y `frontend-<sha>` para frontend

Si cambias `project_name` o `environment`, ajusta tambien el nombre usado por `build-push-ecr`.

## Validacion
Antes de fusionar a `main`:
```bash
cd backend && npm test && npm run build
cd ../frontend && npm test && npm run build
cd ../mobile && npm run typecheck && npm test
cd ../infra/terraform && terraform fmt -check -recursive
```

Despues del despliegue:
```bash
terraform -chdir=infra/terraform output portal_url
terraform -chdir=infra/terraform output backend_health_url
```

Luego valida:
- el portal responde en `portal_url`
- `backend_health_url` devuelve estado `ok` o `degraded` explicable
- el dashboard consume `/api/telemetry/state`
- el WebSocket `/ws` conecta desde el navegador

## Rollback
El rollback automatico primario es el deployment circuit breaker de ECS.

Para rollback manual, reejecuta `deploy-terraform` con `image_tag` apuntando a un SHA anterior publicado. El workflow aplica `image_tag=<sha>` para backend/worker y `frontend_image_tag=frontend-<sha>` para mantener consistencia entre contratos.

Si solo necesitas detener cambios de infraestructura, revierte el commit de Terraform y deja que el pipeline aplique nuevamente el estado deseado.
