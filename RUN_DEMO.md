# Guía de defensa en vivo

Todos los accesos pasan por una sola entrada: `http://localhost:8080`.

## 1. Levantar y preparar el escenario

Abra PowerShell en la raíz del repositorio y ejecute:

```powershell
Set-Location "C:\Users\calvi\OneDrive\Desktop\parcial2-sw2"
$compose = @("-f", ".\infra\docker-compose.yml", "-f", ".\infra\docker-compose.observability.yml")
docker compose @compose --profile demo up -d
python .\infra\seed-demo-data.py
docker compose @compose --profile demo ps
```

El seed es idempotente: puede ejecutarse nuevamente para devolver cupos, CVs, postulaciones y rankings a su estado inicial. Espere a que muestre `Demo lista` antes de abrir las pantallas.

Si faltan imágenes locales, Compose puede construir servicios que tienen `build`; no lo inicie sin autorización. Los volúmenes existentes se conservan. No ejecute `down -v` ni elimine datos para reiniciar el realm.

Para ver las instrucciones de los perfiles `observability`, `demo` y `full`, sus comandos para detener servicios sin borrar datos y la verificación de Prometheus/Grafana, consulte la sección **Perfiles para desarrollo local** de `README.md`.

## 2. URLs y credenciales

| Componente | URL por API Gateway |
|---|---|
| ERP React | http://localhost:8080/erp/ |
| BI Angular | http://localhost:8080/bi/ |
| Portal Vue PWA | http://localhost:8080/portal/ |
| Keycloak | http://localhost:8080/auth/ |
| Consola del realm | http://localhost:8080/auth/realms/recruitment/account/ |
| n8n | http://localhost:8080/automation/ |
| Health del Gateway | http://localhost:8080/health |

Usuarios del realm `recruitment`, definidos en `infra/keycloak/realm-recruitment.json`:

| Usuario | Contraseña | Roles |
|---|---|---|
| `rrhh.demo` | `Demo123!` | `RRHH`, `AI_AGENT` |
| `docente.demo` | `Demo123!` | `RRHH` |

Administrador de Keycloak para desarrollo: `admin` / `admin_dev`. RabbitMQ Management está disponible directamente en http://localhost:15672 con `platform_user` / `platform_dev`.

## 3. Guion recomendado

1. Entre al ERP con `rrhh.demo`. Seleccione **Ingeniero de Sistemas Senior**, elija un candidato y pulse **Contratar candidato · Ejecutar SAGA**. Tiene dos cupos disponibles y el Paso 3 puede crear el contrato.
2. Vuelva a ejecutar el seed para restaurar el escenario. Seleccione **Arquitecto Cloud & IA**, que permanece `ABIERTA` pero tiene cero cupos, elija un candidato y pulse **Forzar rollback (cupo 0)**. PostgreSQL rechazará el Paso 3 y los consumidores compensarán MongoDB y DynamoDB.
3. En **Misión inteligente**, ejecute la misión precargada. **Especialista DevSecOps** tiene una apertura de 21 días y debe aparecer como vacante crítica mediante MCP.
4. Abra BI y use: `candidatos con puntaje mayor a 80 y salario menor a 12000`. Muestre después la exportación XLSX o PDF.
5. Pruebe el bloqueo de inyección con: `DROP TABLE candidatos;` y contraste con la consulta válida.
6. Abra el Portal PWA, active la simulación de red inestable y muestre que los tres reintentos conservan el mismo `Idempotency-Key`.

IDs estables útiles durante la explicación:

- SAGA exitosa: `11111111-1111-4111-8111-111111111101`
- SAGA con rollback: `11111111-1111-4111-8111-111111111102`
- Vacante crítica MCP: `11111111-1111-4111-8111-111111111103`

## 4. Diagnóstico rápido

```powershell
$compose = @("-f", ".\infra\docker-compose.yml", "-f", ".\infra\docker-compose.observability.yml")
docker compose @compose --profile demo ps
docker compose @compose --profile demo logs --tail 100 api-gateway ms-vacantes ms-ingesta ms-ranking cqrs-read-service ai-node
```

Para volver a sembrar sin reconstruir imágenes:

```powershell
python .\infra\seed-demo-data.py
```
