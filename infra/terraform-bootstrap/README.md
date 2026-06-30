# Terraform state bootstrap

Este directorio crea el backend remoto minimo que usa `infra/terraform/`:
- un bucket S3 para `terraform.tfstate`
- una tabla DynamoDB para lock de estado

Uso local:
```bash
cd infra/terraform-bootstrap
terraform init
terraform apply
```

Uso desde GitHub Actions:
- ejecutar la workflow `bootstrap-terraform-state`
- revisar los outputs y confirmar que el backend remoto quedo creado
- luego ejecutar `deploy-terraform`

Para el stack principal, copia `infra/terraform/backend.hcl.example` a un archivo local `backend.hcl` y usa `terraform init -backend-config=backend.hcl`.

### Convencion por ambiente
Usamos nombres separados para evitar colisiones entre entornos:

| Ambiente | Bucket S3 | Tabla DynamoDB | State key |
| --- | --- | --- | --- |
| dev | `fleet-telemetry-tfstate-dev` | `fleet-telemetry-tf-locks-dev` | `fleet-telemetry/dev/terraform.tfstate` |
| staging | `fleet-telemetry-tfstate-staging` | `fleet-telemetry-tf-locks-staging` | `fleet-telemetry/staging/terraform.tfstate` |
| prod | `fleet-telemetry-tfstate-prod` | `fleet-telemetry-tf-locks-prod` | `fleet-telemetry/prod/terraform.tfstate` |

### Comandos sugeridos
```bash
cd infra/terraform-bootstrap
terraform init
terraform apply -var="state_bucket_name=fleet-telemetry-tfstate-dev" -var="lock_table_name=fleet-telemetry-tf-locks-dev"
```

Para staging y prod cambia los sufijos `dev` por `staging` o `prod`.

Los valores por defecto coinciden con la workflow de despliegue:
- bucket: `fleet-telemetry-tfstate`
- lock table: `fleet-telemetry-tf-locks`
- state key: `fleet-telemetry/dev/terraform.tfstate`

Si el bucket ya existe en otra cuenta, ajusta `state_bucket_name` antes del primer `apply`.
