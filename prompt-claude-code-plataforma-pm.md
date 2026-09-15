# PROMPT PARA CLAUDE CODE — Desarrollo Autónomo de Plataforma de Gestión de Proyectos

## 0. INSTRUCCIÓN DE OPERACIÓN (leer primero)

Actúa como un arquitecto de software senior y equipo de desarrollo full-stack autónomo. Tu tarea es construir **de principio a fin, sin detenerte a pedir aclaraciones al usuario**, el MVP de una plataforma de gestión y seguimiento de proyectos (estilo Jira + MS Project + ProjectLibre + GanttPRO + Tempo, con elementos de Notion).

Reglas de trabajo:
1. **No hagas preguntas al usuario.** Si encuentras una ambigüedad, toma la decisión más estándar/convencional de la industria, impleméntala, y documenta la decisión y su justificación en `docs/DECISIONS.md` (formato ADR corto: contexto, decisión, alternativas consideradas, consecuencias).
2. Entrega **código funcional real**, no pseudocódigo ni placeholders con `TODO` sin implementar. Si algo queda fuera del alcance del MVP, decláralo explícitamente en `docs/BACKLOG.md`.
3. Trabaja **por fases** (ver sección 9). Al terminar cada fase, ejecuta linter + tests y confirma que todo esté en verde antes de continuar a la siguiente.
4. Sigue exactamente la estructura de carpetas de la sección 3, el modelo de datos de la sección 5 y el stack tecnológico de la sección 2. No sustituyas librerías por otras equivalentes sin justificarlo en `docs/DECISIONS.md`.
5. Cada módulo debe incluir sus pruebas automatizadas en el mismo commit/fase en que se crea, no al final.
6. Al finalizar, entrega un `README.md` que permita a cualquier desarrollador levantar el proyecto localmente con un solo comando y desplegarlo en Vercel siguiendo los pasos documentados en la sección 12.

---

## 1. OBJETIVO DEL PRODUCTO

Construir la **primera versión (v1)** de una plataforma web de gestión de proyectos, enfocada exclusivamente en cinco pilares: gestión de proyectos/portafolio, gestión de tareas, planificación y cronograma (Gantt/ruta crítica), seguimiento cuantitativo de avance (curva S / valor ganado) y reportes/dashboards. Para poder calcular el costo real del valor ganado sin un módulo completo de recursos, v1 incluye una **captura básica de horas trabajadas** (sin flujo de aprobación), suficiente para derivar el costo real (AC) de forma automática.

Usuarios objetivo: jefes de proyecto y colaboradores de equipo. Todo lo que no sea estrictamente necesario para estos cinco pilares queda fuera de v1 (ver sección 4.2).

**Plataforma de despliegue: Vercel.** Esto es una restricción de arquitectura, no solo de infraestructura: tanto el frontend como el backend se ejecutan como **Vercel Functions serverless** (sin servidor persistente), la base de datos es PostgreSQL administrado externamente (Neon, vía Vercel Marketplace) y los procesos programados usan **Vercel Cron Jobs** en lugar de un worker persistente tipo Celery. Esto afecta directamente el stack (sección 2), la estructura de carpetas (sección 3) y la lógica de negocio (sección 6): no debe diseñarse nada que asuma un proceso Python de larga duración.

---

## 2. STACK TECNOLÓGICO (obligatorio, no negociable salvo justificación documentada)

### Backend (100% Python, desplegado como Vercel Functions)
- **Python 3.12+**
- **FastAPI** (>=0.115) — framework web asíncrono, expone API REST. Se monta como una única Vercel Function vía adaptador ASGI (Vercel soporta FastAPI de forma nativa con runtime Python real, no WebAssembly).
- **SQLAlchemy 2.0** (ORM, estilo declarative con `Mapped`/`mapped_column`) — configurado en modo serverless-friendly (ver 6.4: pool mínimo, usar el connection string *pooled* de Neon).
- **Alembic** — migraciones de base de datos, ejecutadas manualmente o vía script en el pipeline de CI, nunca en el arranque de una función serverless.
- **Pydantic v2** — validación y schemas de entrada/salida
- **PostgreSQL 16 (Neon)** — base de datos administrada, provista vía Vercel Marketplace (plan gratuito)
- **passlib[bcrypt]** — hashing de contraseñas
- **python-jose[cryptography]** o **PyJWT** — JWT (access + refresh tokens); el refresh token se persiste en la tabla `refresh_tokens` de PostgreSQL (no hay Redis en v1 — ver sección 5)
- **Poetry** — gestión de dependencias en desarrollo; para el despliegue en Vercel, exportar además un `requirements.txt` (Vercel detecta el runtime Python vía `requirements.txt`, `pyproject.toml` o `Pipfile`)
- **pytest, pytest-asyncio, httpx, factory_boy** — testing
- **ruff, black, mypy** — linting, formateo y tipado estático
- **structlog** — logging estructurado (los logs de Vercel Functions se ven en el dashboard de Vercel)
- **uvicorn** — solo para desarrollo local (`vercel dev` o `uvicorn` directo); en producción Vercel invoca la app ASGI directamente, sin gunicorn

**Sin Redis, sin Celery, sin Celery Beat.** El modelo de Vercel es serverless (funciones sin estado, sin proceso persistente). Todo lo que en un diseño tradicional iría a un worker asíncrono se resuelve así en v1:
- Recálculo de ruta crítica y reprogramación en cascada → **síncrono**, dentro del mismo request que crea/edita la tarea o dependencia (ver 6.1/6.2).
- Recálculo diario de curva S/EVM → **Vercel Cron Job** que invoca un endpoint HTTP una vez al día (ver 6.3 y 13).

### Frontend (SPA, consume la API, desplegado como proyecto Vercel independiente)
- **React 18 + TypeScript 5**
- **Vite 5** — bundler (Vercel detecta y construye proyectos Vite automáticamente)
- **TanStack Query** — manejo de estado de datos remotos/caché
- **TanStack Table** — tablas de tareas
- **Zustand** — estado global ligero
- **React Router 6**
- **Recharts** — gráficos (curva S, dashboards, SPI/CPI)
- **frappe-gantt** o **svar-gantt** (librería open source, sin licencia) — componente Gantt interactivo; si ninguna cumple los requisitos de drag & drop + dependencias visuales, documentar en DECISIONS.md la alternativa elegida
- **TailwindCSS** — estilos
- **Axios** — cliente HTTP

### Infraestructura
- **Docker + Docker Compose** — únicamente para **desarrollo local** (Postgres local para no depender de Neon en desarrollo día a día). No se usa Docker para producción: Vercel construye y ejecuta el backend con su propio build system, sin Dockerfile.
- **GitHub Actions** — CI (lint + test); el despliegue a Vercel ocurre vía la integración nativa Git de Vercel (cada push a `main` dispara un deploy de producción, cada PR genera un preview deployment), no vía un job de CI que haga `docker build`.
- **Vercel CLI** (`vercel dev`, `vercel env`, `vercel deploy`) — para desarrollo y despliegue manual cuando haga falta.

---

## 3. ESTRUCTURA DE CARPETAS (obligatoria)

```
project-management-platform/
├── backend/
│   ├── api/
│   │   └── index.py                        # entrypoint de Vercel: importa la app FastAPI de src/app/main.py y la expone como handler ASGI
│   ├── src/
│   │   └── app/
│   │       ├── main.py                     # instancia de FastAPI (montada por api/index.py)
│   │       ├── core/
│   │       │   ├── config.py                # Settings (Pydantic BaseSettings) — lee DATABASE_URL, JWT_SECRET, CRON_SECRET de env vars de Vercel
│   │       │   ├── security.py              # hashing, JWT, dependencias de auth
│   │       │   ├── database.py              # engine, sessionmaker, get_db() — configurado para conexión pooled de Neon (ver 6.4)
│   │       │   ├── logging.py
│   │       │   └── exceptions.py            # excepciones y handlers custom
│   │       ├── models/                      # SQLAlchemy ORM models
│   │       │   ├── __init__.py
│   │       │   ├── organization.py
│   │       │   ├── user.py
│   │       │   ├── refresh_token.py         # persistencia de refresh tokens (reemplaza a Redis)
│   │       │   ├── project.py
│   │       │   ├── task.py
│   │       │   ├── dependency.py
│   │       │   ├── baseline.py
│   │       │   ├── worklog.py                # captura básica de horas (sin aprobación)
│   │       │   └── progress_snapshot.py
│   │       ├── schemas/                     # Pydantic (request/response)
│   │       │   └── (un archivo por entidad, igual nomenclatura que models/)
│   │       ├── api/
│   │       │   └── v1/
│   │       │       ├── router.py            # agrega todos los sub-routers
│   │       │       └── endpoints/
│   │       │           ├── auth.py
│   │       │           ├── organizations.py
│   │       │           ├── users.py
│   │       │           ├── projects.py
│   │       │           ├── tasks.py
│   │       │           ├── dependencies.py
│   │       │           ├── baselines.py
│   │       │           ├── worklogs.py
│   │       │           ├── progress.py       # EVM / curva S, incluye endpoint del cron
│   │       │           ├── dashboard.py
│   │       │           └── reports.py
│   │       ├── services/                    # lógica de negocio pura
│   │       │   ├── auth_service.py
│   │       │   ├── critical_path.py         # algoritmo CPM (ejecución síncrona)
│   │       │   ├── scheduler.py             # reprogramación en cascada (ejecución síncrona)
│   │       │   ├── evm.py                   # cálculo PV/EV/AC/SPI/CPI
│   │       │   └── scurve.py                # agregación de curva S
│   │       ├── repositories/                # capa de acceso a datos (queries)
│   │       └── middleware/
│   │           └── tenant_context.py        # scoping multi-organización
│   ├── alembic/
│   │   ├── versions/
│   │   └── env.py
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   ├── fixtures/
│   │   └── conftest.py
│   ├── pyproject.toml                       # fuente de verdad de dependencias (desarrollo)
│   ├── requirements.txt                     # generado desde pyproject.toml, usado por Vercel para el build
│   ├── alembic.ini
│   ├── vercel.json                          # config de Vercel: rutas, maxDuration, cron jobs (ver sección 12)
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/                             # cliente Axios + endpoints tipados
│   │   ├── components/
│   │   │   ├── gantt/
│   │   │   ├── scurve/
│   │   │   ├── kanban/
│   │   │   ├── dashboard/
│   │   │   ├── timesheet/
│   │   │   └── common/
│   │   ├── pages/
│   │   │   ├── auth/
│   │   │   ├── projects/
│   │   │   ├── tasks/
│   │   │   ├── reports/
│   │   │   └── dashboard/
│   │   ├── hooks/
│   │   ├── store/
│   │   ├── types/
│   │   └── styles/
│   ├── public/
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── docs/
│   ├── architecture.md
│   ├── database-schema.md
│   ├── api-conventions.md
│   ├── DECISIONS.md                          # ADRs de decisiones autónomas
│   └── BACKLOG.md                            # funcionalidades fuera del MVP
├── scripts/
│   └── seed_data.py                          # datos de ejemplo/demo
├── .github/
│   └── workflows/
│       └── ci.yml                            # lint + test (el deploy lo hace Vercel vía integración Git, no este workflow)
├── docker-compose.yml                        # SOLO para desarrollo local (Postgres); no se usa en producción
├── .gitignore
└── README.md
```

---

## 4. ALCANCE FUNCIONAL DEL MVP

El alcance de v1 se limita estrictamente a los pilares **A (Proyectos/Portafolio)**, **B (Tareas)**, **C (Planificación/Cronograma)**, **F (Seguimiento de avance/Curva S/EVM)** y **G (Reportes/Dashboards)**, más la infraestructura mínima indispensable (autenticación) sin la cual el sistema no podría funcionar. Todo lo demás (D, E completo, H, I, J avanzado, K, L, M) queda fuera de v1 — ver 4.2.

### 4.1 Incluido en v1

**Infraestructura mínima (no es un pilar en sí, pero es requisito técnico)**
1. **Autenticación**: registro (crea organización + usuario admin), login, JWT access+refresh. Solo dos roles: `admin` (gestiona proyectos, usuarios y aprueba nada — no hay aprobaciones en v1) y `member` (crea/edita tareas asignadas a él y registra sus horas). Sin invitaciones por email, sin SSO/2FA (backlog).

**A. Gestión de Proyectos y Portafolio**
2. CRUD de proyectos, estados (`planning`, `active`, `on_hold`, `completed`, `cancelled`).
3. Miembros de proyecto (usuarios asociados a un proyecto).
4. Portafolio: vista consolidada de todos los proyectos del usuario/organización.
5. Calendario laboral básico a nivel de proyecto (días festivos, jornada estándar) — usado por el CPM.

**B. Gestión de Tareas**
6. CRUD de tareas y subtareas (WBS jerárquico, `parent_task_id`).
7. Fechas inicio/fin, duración, % de avance, estado, prioridad, marca de hito (`is_milestone`).
8. Costo presupuestado por tarea (`budgeted_cost`) y horas estimadas — necesarios para el EVM.
9. Asignación de responsables (uno o varios usuarios por tarea, con % de dedicación). No hay gestión de recursos materiales/equipo (backlog).

**C. Planificación y Cronograma**
10. Dependencias entre tareas: FS/SS/FF/SF con adelanto/retraso (lag), con validación de ciclos.
11. Gantt interactivo: drag & drop, líneas de dependencia, resaltado de ruta crítica, zoom día/semana/mes.
12. Ruta crítica (CPM): cálculo automático (ES, EF, LS, LF, holgura total), recalculado de forma **síncrona** (dentro del mismo request HTTP) al cambiar fechas/dependencias — no hay worker asíncrono en v1 (arquitectura serverless en Vercel, ver sección 2).
13. Reprogramación en cascada: al mover una tarea, recalcular fechas de sucesoras.
14. Líneas base (baseline): guardar snapshot de fechas/costo planificado; permitir múltiples baselines históricas — es la fuente del "avance previsto".
15. Vistas alternativas de las mismas tareas: lista (tabla filtrable/ordenable), Kanban simple (por estado), calendario básico.

**F. Seguimiento de Avance / Curva S / Valor Ganado**
16. **Captura básica de horas trabajadas** (subconjunto mínimo de lo que sería un módulo de tiempo completo, incluido únicamente porque el EVM lo necesita): un colaborador registra horas contra una tarea (fecha, horas, descripción). **Sin flujo de aprobación, sin facturable/no facturable, sin cronómetro, sin reportes de capacidad** — todo eso es backlog (módulo E completo). Cada usuario tiene un campo `cost_per_hour` opcional (en vez de un módulo de recursos completo) que permite derivar el costo real automáticamente.
17. PV (valor planeado, desde baseline), EV (valor ganado, desde % avance × costo presupuestado), AC (costo real, desde horas registradas × `cost_per_hour` del usuario).
18. Índices SPI y CPI.
19. Curva S acumulada (PV/EV/AC) por semana.
20. Snapshot histórico en `progress_snapshots` (recalculado por un **Vercel Cron Job diario** + endpoint on-demand).

**G. Reportes y Dashboards**
21. Dashboard de proyecto: avance, SPI/CPI, tareas vencidas, próximos hitos.
22. Dashboard de portafolio: resumen de todos los proyectos.
23. Reporte simple de horas registradas por usuario/proyecto/rango de fechas (derivado del punto 16, no un módulo de timesheets completo).
24. Reportes exportables: CSV de tareas y de horas; PDF simple del resumen de proyecto (curva S + KPIs).
25. API REST documentada automáticamente (OpenAPI/Swagger vía FastAPI en `/docs`).

### 4.2 Explícitamente fuera de v1 (documentar en `docs/BACKLOG.md`)
- **D. Gestión de Recursos completa**: recursos materiales/equipo, costeo por tipo de recurso, calendario de disponibilidad por recurso, vista de carga de trabajo (workload/histograma).
- **E. Registro de horas completo (estilo Tempo)**: flujo de aprobación (`draft`→`submitted`→`approved`/`rejected`), facturable/no facturable, CapEx/OpEx, cronómetro start/stop, capacidad del equipo, integraciones con calendario para pre-llenado.
- **H. Colaboración**: comentarios, menciones, notificaciones in-app, chat.
- **I. Documentación tipo Notion**: wiki, bases de datos relacionales con rollups, plantillas de documentos.
- **J. Administración avanzada**: roles granulares por proyecto, multi-tenant completo con invitaciones, auditoría detallada (`audit_logs`), SSO/2FA.
- **K. Integraciones**: MS Project (.mpp), ERP, Slack/Teams, webhooks.
- **L. Plataforma**: app móvil nativa, modo offline, multi-idioma.
- **M. Avanzado**: simulación Monte Carlo, gestión de riesgos, IA, escenarios "qué pasaría si".

---

## 5. MODELO DE DATOS (PostgreSQL) — obligatorio como base, se puede extender pero no reducir

Usar UUID como PK en todas las tablas (`uuid_generate_v4()` o `gen_random_uuid()` de la extensión `pgcrypto`). Todas las tablas llevan `created_at`, `updated_at` (con trigger o manejo en ORM); las de negocio principales llevan `organization_id` para scoping multi-tenant salvo que hereden el scoping vía relación (ej. `tasks` hereda de `projects`).

### organizations
`id, name, slug (unique), created_at, updated_at`

### users
`id, organization_id (FK), email (unique), hashed_password, full_name, role (enum: admin|member), cost_per_hour (numeric, nullable — usado para calcular el costo real AC sin necesidad de un módulo de recursos), is_active (bool), created_at, updated_at`

### refresh_tokens
`id, user_id (FK), token_hash (string, hash del refresh token, nunca se guarda en texto plano), expires_at, revoked (bool, default false), created_at` — reemplaza el uso de Redis para persistir refresh tokens (no hay Redis en v1, ver sección 2). Índice en `(user_id, expires_at)`. Job de limpieza de tokens expirados: no es necesario en v1 (se filtran por `expires_at`/`revoked` en cada consulta); documentar como posible mejora en `docs/BACKLOG.md`.

### projects
`id, organization_id (FK), name, description, status (enum: planning|active|on_hold|completed|cancelled), start_date, end_date, created_by (FK users), created_at, updated_at`

### project_members
`id, project_id (FK), user_id (FK), UNIQUE(project_id, user_id)` — el rol efectivo del usuario en el proyecto es el mismo `role` global (`admin`/`member`); no hay rol por proyecto en v1 (backlog: J).

### tasks
`id, project_id (FK), parent_task_id (FK tasks, nullable), name, description, wbs_code, start_date, end_date, duration_days, percent_complete (0-100), status (enum: not_started|in_progress|blocked|completed), priority (enum: low|medium|high|critical), is_milestone (bool), estimated_hours, budgeted_cost (numeric), early_start, early_finish, late_start, late_finish, total_float, is_critical (bool), created_at, updated_at`

### task_assignees
`id, task_id (FK), user_id (FK), allocation_percent (numeric, default 100), UNIQUE(task_id, user_id)`

### task_dependencies
`id, predecessor_id (FK tasks), successor_id (FK tasks), dependency_type (enum: FS|SS|FF|SF, default FS), lag_days (int, default 0), UNIQUE(predecessor_id, successor_id)`
Validación aplicativa: rechazar si se crea un ciclo (recorrido DFS antes de insertar).

### baselines
`id, project_id (FK), name, created_by (FK users), created_at`

### baseline_tasks
`id, baseline_id (FK), task_id (FK tasks), planned_start_date, planned_end_date, planned_cost (numeric)`

### worklogs
`id, task_id (FK), user_id (FK), work_date, hours (numeric), description (nullable), created_at, updated_at` — sin `status`/`billable`/aprobación: toda hora registrada se considera válida de inmediato y se incluye en el cálculo de AC (ver 6.3). Esto es una simplificación deliberada de v1, documentada como decisión en `docs/DECISIONS.md`.

### progress_snapshots
`id, project_id (FK), snapshot_date, cumulative_pv (numeric), cumulative_ev (numeric), cumulative_ac (numeric), spi (numeric), cpi (numeric), created_at`

**Índices obligatorios**: FKs, `tasks(project_id)`, `tasks(parent_task_id)`, `task_dependencies(predecessor_id)`, `task_dependencies(successor_id)`, `worklogs(task_id, user_id, work_date)`, `progress_snapshots(project_id, snapshot_date)`, `refresh_tokens(user_id, expires_at)`.

**Nota crítica de despliegue (Neon + Vercel Functions)**: cada invocación de una Vercel Function puede abrir su propia conexión a la base de datos, y en picos de tráfico esto puede agotar las conexiones de Postgres. Usar el **connection string *pooled* de Neon** (basado en PgBouncer, sufijo `-pooler` en el host) como `DATABASE_URL`, y configurar el engine de SQLAlchemy con `pool_size` bajo (1-2) o `NullPool` en producción. Si se usa el modo *transaction pooling* de PgBouncer, deshabilitar el uso de prepared statements en el driver (ej. `statement_cache_size=0` en `asyncpg`) para evitar errores. Documentar esta configuración en `docs/architecture.md`.

**Nota para v2+ (no implementar en v1, dejar preparado en `docs/BACKLOG.md`)**: cuando se agregue el módulo D (Recursos) y el módulo E completo (Tempo-style), `worklogs` deberá extenderse con `billable`, `status`, `approved_by`; y el costo por hora migrará de `users.cost_per_hour` a una tabla `resources` independiente. No sobre-diseñar esto ahora.

---

## 6. LÓGICA DE NEGOCIO CLAVE (especificación de algoritmos)

### 6.1 Ruta crítica (CPM) — `services/critical_path.py`
1. Ordenar tareas topológicamente según `task_dependencies`.
2. **Pasada hacia adelante**: `ES` de una tarea sin predecesores = su `start_date`; para tareas con predecesores, `ES` = máximo entre las restricciones impuestas por cada predecesor según `dependency_type` y `lag_days` (FS: `EF_predecesor + lag`; SS: `ES_predecesor + lag`; etc.). `EF = ES + duration_days`.
3. **Pasada hacia atrás**: partiendo de la fecha fin del proyecto, calcular `LF` y `LS = LF - duration_days` para cada tarea, considerando restricciones de sucesores.
4. `total_float = LS - ES`. Tareas con `total_float == 0` son críticas (`is_critical = true`).
5. Ejecutar este cálculo de forma **síncrona, dentro del mismo request HTTP** que crea/edita una tarea o dependencia (no hay worker asíncrono en v1). Si el proyecto tiene muchas tareas, optimizar el algoritmo (topological sort en memoria, una sola consulta a BD para cargar todas las tareas/dependencias del proyecto) para mantenerse dentro del límite de duración de la función serverless (ver sección 12).

### 6.2 Reprogramación en cascada — `services/scheduler.py`
Al cambiar `start_date`/`end_date` de una tarea, recorrer sus sucesoras en `task_dependencies` y ajustar sus fechas si violan la restricción de dependencia, propagando el cambio de forma recursiva (con detección de ciclos ya garantizada en la validación de creación).

### 6.3 EVM y Curva S — `services/evm.py` y `services/scurve.py`
Dado un `project_id` y una `status_date` (por defecto: hoy):
- **PV(t)** = suma de `planned_cost` (desde `baseline_tasks` de la baseline activa) de la porción de cada tarea programada hasta `t`, prorrateada linealmente entre `planned_start_date` y `planned_end_date`.
- **EV(t)** = suma de `(percent_complete / 100) * budgeted_cost` de cada tarea, evaluado a la fecha `t` (usar el valor de `percent_complete` vigente a esa fecha si se guarda historial, o el valor actual si `t` = hoy).
- **AC(t)** = suma de `worklogs.hours * users.cost_per_hour` de todos los worklogs del proyecto con `work_date <= t`. Si `users.cost_per_hour` es `null` para un usuario, tratar como `0` en la suma (y registrar advertencia en logs; no bloquear el cálculo). No hay filtro por estado de aprobación en v1: todo worklog registrado cuenta de inmediato.
- `SPI = EV / PV` (si `PV = 0`, retornar `null`), `CPI = EV / AC` (si `AC = 0`, retornar `null`).
- La curva S se construye agregando estos valores de forma semanal desde el inicio hasta el fin planificado del proyecto, almacenando cada punto en `progress_snapshots`.
- Job programado: **Vercel Cron Job**, configurado en `vercel.json` (ver sección 12), que invoca diariamente `POST /api/v1/progress/recalculate-all` — un endpoint que recorre todos los proyectos con `status = active` y recalcula/guarda el snapshot del día para cada uno. Este endpoint debe estar protegido verificando un header `Authorization: Bearer <CRON_SECRET>` (variable de entorno), para que solo Vercel Cron pueda invocarlo. Además, exponer el endpoint on-demand por proyecto `POST /projects/{id}/progress/recalculate` para recálculo manual desde el frontend.
- **Restricción de tiempo**: la función que atiende `/progress/recalculate-all` debe procesar los proyectos de forma eficiente (una consulta por proyecto, no N+1) para mantenerse dentro del límite de duración del plan de Vercel usado (10s en Hobby). Si el número de proyectos activos crece lo suficiente como para no caber en ese tiempo, documentar en `docs/BACKLOG.md` la necesidad de paginar el recálculo en varias invocaciones o de subir a un plan con mayor `maxDuration`.

---

## 7. DISEÑO DE API (REST, prefijo `/api/v1`)

Convenciones: JSON en request/response, paginación por `limit`/`offset` (default `limit=20`, máx `100`) en todos los listados, errores con formato uniforme `{ "detail": str, "code": str }`, autenticación vía header `Authorization: Bearer <token>`.

```
POST   /auth/register              # crea organización + usuario admin
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout

GET    /users
GET    /users/{id}
PATCH  /users/{id}
POST   /users/invite

GET    /projects
POST   /projects
GET    /projects/{id}
PATCH  /projects/{id}
DELETE /projects/{id}
GET    /projects/{id}/members
POST   /projects/{id}/members
DELETE /projects/{id}/members/{user_id}

GET    /projects/{id}/tasks
POST   /projects/{id}/tasks
GET    /tasks/{id}
PATCH  /tasks/{id}
DELETE /tasks/{id}
GET    /projects/{id}/gantt          # tareas + dependencias + flags de ruta crítica, payload optimizado

POST   /tasks/{id}/dependencies
DELETE /dependencies/{id}

POST   /projects/{id}/baselines
GET    /projects/{id}/baselines
GET    /baselines/{id}

GET    /tasks/{id}/worklogs
POST   /tasks/{id}/worklogs
PATCH  /worklogs/{id}
DELETE /worklogs/{id}
GET    /reports/worklogs                # filtrable por user_id, project_id, from, to

GET    /projects/{id}/progress
POST   /projects/{id}/progress/recalculate
POST   /progress/recalculate-all           # invocado por Vercel Cron (protegido con CRON_SECRET), recalcula snapshot diario de todos los proyectos activos

GET    /dashboard/summary
GET    /projects/{id}/dashboard

GET    /projects/{id}/reports/export

GET    /health
```

Nota: no hay endpoints de `/resources` ni `/notifications` en v1 (módulos D y H, fuera de alcance). No hay `submit`/`approve`/`reject` en worklogs (no hay flujo de aprobación en v1).

---

## 8. AUTENTICACIÓN Y AUTORIZACIÓN

- JWT access token (expira 30 min) + refresh token (expira 7 días, almacenado **hasheado en la tabla `refresh_tokens` de PostgreSQL** — no hay Redis en v1).
- Password hashing con bcrypt (`passlib`).
- **Rate limiting en `/auth/login`**: sin Redis disponible, implementar un límite simple basado en PostgreSQL (ej. columna `failed_login_attempts` + `locked_until` en `users`, o una tabla `login_attempts` con conteo por IP/usuario en una ventana de tiempo). No introducir una dependencia externa solo para esto; documentar la limitación en `docs/DECISIONS.md`.
- Matriz de permisos por rol (solo dos roles en v1; aplicar como dependencias de FastAPI, ej. `require_role(["admin"])`). Roles más granulares (project_manager, viewer) quedan en backlog (módulo J):

| Acción | admin | member |
|---|---|---|
| Crear/editar/borrar proyectos | ✅ | ❌ |
| Gestionar miembros de proyecto | ✅ | ❌ |
| Crear/editar tareas | ✅ | ✅ (del proyecto donde es miembro) |
| Registrar horas propias | ✅ | ✅ |
| Guardar baselines | ✅ | ❌ |
| Ver dashboards/reportes | ✅ | ✅ (proyectos donde participa) |
| Gestionar usuarios | ✅ | ❌ |

- Scoping multi-tenant: todo query debe filtrar por `organization_id` del usuario autenticado (aplicar vía middleware o dependencia común `get_current_org()`).

---

## 9. FASES DE DESARROLLO (ejecutar en este orden, con tests en cada una)

- **Fase 0 — Scaffolding**: estructura de carpetas completa, `docker-compose.yml` para desarrollo local (solo Postgres), `pyproject.toml` + `requirements.txt`, configuración de Alembic, `vercel.json` inicial (esqueleto), CI básico (lint + test) en GitHub Actions.
- **Fase 1 — Auth y organizaciones**: modelos `organizations`, `users` (con `cost_per_hour`), `refresh_tokens`; endpoints de auth con refresh token persistido en BD; roles `admin`/`member`; middleware de tenant; tests unitarios e integración.
- **Fase 2 — Proyectos y tareas (WBS)**: CRUD proyectos, miembros de proyecto, tareas, jerarquía, asignación de responsables, dependencias con validación de ciclos.
- **Fase 3 — Motor de planificación**: CPM (`critical_path.py`) y reprogramación en cascada ejecutados de forma síncrona en el request, endpoint `/gantt`, vistas Kanban/calendario/lista.
- **Fase 4 — Baselines y captura de horas**: baselines + snapshot de fechas/costo, worklogs simples (sin aprobación), reporte de horas por usuario/proyecto/rango.
- **Fase 5 — EVM y Curva S**: `evm.py`, `scurve.py`, `progress_snapshots`, endpoint `/progress/recalculate-all` protegido con `CRON_SECRET`, endpoints de progreso por proyecto.
- **Fase 6 — Dashboard y reportes export** (CSV/PDF).
- **Fase 7 — Frontend**: scaffolding React+Vite, integración completa con la API (auth, proyectos, Gantt interactivo, curva S con Recharts, captura de horas, dashboard, Kanban).
- **Fase 8 — Configuración de despliegue en Vercel**: `backend/api/index.py` (entrypoint ASGI), `backend/vercel.json` (rutas, `maxDuration`, cron job diario), conexión a Neon vía Marketplace con connection string pooled, variables de entorno en Vercel (`DATABASE_URL`, `JWT_SECRET_KEY`, `CRON_SECRET`), despliegue del frontend como proyecto Vercel separado (o mismo repo, root distinto). Ver sección 12 para el detalle completo.
- **Fase 9 — Endurecimiento**: cobertura de tests (objetivo ≥80% en `services/`), validación exhaustiva de inputs, documentación final (`README.md`, `docs/architecture.md`, `docs/database-schema.md`, `docs/BACKLOG.md` con D/E completo/H/I/J/K/L/M detallados), datos semilla (`scripts/seed_data.py`) para demo.

---

## 10. CALIDAD Y ESTÁNDARES DE CÓDIGO

- Tipado estático completo (type hints) validado con `mypy --strict` en `services/` y `models/`.
- Formato con `black` y linting con `ruff`, ejecutados en CI; el build falla si hay errores.
- Docstrings estilo Google en funciones públicas de `services/` y `repositories/`.
- Commits siguiendo Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`).
- Ningún secreto hardcodeado; todo vía variables de entorno (`.env.example` documentado).

---

## 11. CRITERIOS DE ACEPTACIÓN (Definition of Done del MVP)

- [ ] `docker compose up` levanta Postgres localmente para desarrollo; el backend corre con `uvicorn` o `vercel dev` apuntando a esa base de datos local.
- [ ] El proyecto backend se despliega en Vercel sin pasos manuales más allá de configurar variables de entorno (`DATABASE_URL`, `JWT_SECRET_KEY`, `CRON_SECRET`) y conectar la integración de Neon desde el Marketplace de Vercel.
- [ ] El proyecto frontend se despliega en Vercel como sitio estático (build de Vite) sin configuración adicional.
- [ ] El Cron Job diario configurado en `vercel.json` invoca correctamente `POST /progress/recalculate-all` y actualiza `progress_snapshots` de todos los proyectos activos.
- [ ] Alembic aplica las migraciones contra la base de datos de Neon (ejecutado manualmente o vía script, no en el arranque de una función serverless).
- [ ] `scripts/seed_data.py` crea una organización demo con proyectos, tareas, dependencias y worklogs de ejemplo (ejecutable localmente contra Neon o Postgres local).
- [ ] Es posible crear un proyecto, agregar tareas con responsables y dependencias, visualizarlas en un Gantt con ruta crítica resaltada.
- [ ] Es posible guardar una baseline y ver la comparación avance previsto vs. real.
- [ ] La curva S se grafica correctamente con PV/EV/AC y se actualiza al registrar horas o cambiar % de avance.
- [ ] Un colaborador puede registrar horas en una tarea sin flujo de aprobación; el costo real (AC) se calcula automáticamente usando `cost_per_hour` del usuario.
- [ ] El dashboard muestra SPI/CPI y KPIs del proyecto, y un resumen de portafolio con todos los proyectos.
- [ ] Los permisos por rol (`admin`/`member`) se respetan (probado con tests de integración).
- [ ] Documentación Swagger disponible en `/docs` (accesible tanto en local como en la URL de Vercel).
- [ ] Suite de tests pasa en CI con cobertura ≥80% en `services/`.
- [ ] `docs/DECISIONS.md` documenta toda decisión tomada sin input del usuario.
- [ ] `docs/BACKLOG.md` lista explícitamente lo que quedó fuera del MVP.

---

## 12. DESPLIEGUE EN VERCEL (obligatorio, detalle de implementación)

### 13.1 Estructura de proyectos en Vercel
Crear **dos proyectos Vercel independientes** dentro del mismo repositorio (monorepo):
- `backend` → root directory `backend/`, framework preset "Other" (Vercel detecta Python vía `requirements.txt`/`pyproject.toml`).
- `frontend` → root directory `frontend/`, framework preset "Vite" (autodetectado).

### 13.2 Entrypoint del backend — `backend/api/index.py`
Vercel espera un archivo Python bajo `api/` que exponga la app. Usar el adaptador ASGI que provee el runtime de Vercel para montar la app FastAPI existente en `src/app/main.py`:
```python
from src.app.main import app  # instancia FastAPI existente
```
Vercel enruta automáticamente todo el tráfico de ese proyecto hacia esta función; el propio FastAPI/`APIRouter` se encarga del ruteo interno (`/api/v1/...`).

### 13.3 `backend/vercel.json`
Debe incluir, como mínimo:
- Configuración de `functions` para `api/index.py` con `maxDuration` ajustado al plan (10s en Hobby; documentar en `docs/DECISIONS.md` si se requiere más y el proyecto debe subir a Pro).
- Un bloque `crons` con una única entrada apuntando a `/api/v1/progress/recalculate-all`, con expresión cron de **una vez al día** (ej. `0 6 * * *`) — el plan Hobby no permite mayor frecuencia.
- Rewrites/headers según sea necesario para CORS si frontend y backend quedan en dominios `*.vercel.app` distintos.

### 13.4 Variables de entorno (configurar en el dashboard de Vercel, nunca hardcodeadas)
- `DATABASE_URL` — connection string **pooled** de Neon (host con sufijo `-pooler`).
- `JWT_SECRET_KEY`, `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS`.
- `CRON_SECRET` — token que Vercel Cron envía automáticamente en el header `Authorization`; el endpoint `/progress/recalculate-all` debe validar contra este valor.
- `FRONTEND_ORIGIN` — usado para configurar CORS en FastAPI.

### 13.5 Base de datos (Neon vía Vercel Marketplace)
1. Desde el proyecto `backend` en el dashboard de Vercel, instalar la integración nativa **Neon** desde el Marketplace (plan gratuito).
2. Vercel inyecta automáticamente la variable de conexión al proyecto; renombrar/mapear a `DATABASE_URL` en `core/config.py` si el nombre inyectado difiere.
3. Ejecutar las migraciones de Alembic manualmente contra esa base (`alembic upgrade head` desde una máquina local o un job de GitHub Actions con acceso a `DATABASE_URL`), nunca desde el arranque de la función serverless.

### 13.6 CORS y comunicación frontend↔backend
El frontend (proyecto Vercel separado) consulta al backend vía su URL pública (`https://<backend-project>.vercel.app/api/v1`), configurada como variable de entorno de build en el proyecto `frontend` (`VITE_API_BASE_URL`). Configurar CORS en FastAPI para aceptar el origen del frontend.

### 13.7 Desarrollo local
`docker-compose.yml` levanta solo Postgres local. El backend corre con `uvicorn src.app.main:app --reload` (o `vercel dev` desde `backend/`) apuntando a ese Postgres local vía `.env`. El frontend corre con `npm run dev` apuntando a `http://localhost:8000` como `VITE_API_BASE_URL`.

---

## 13. ENTREGABLE FINAL

Repositorio completo, funcional, con historial de commits por fase, `README.md` con instrucciones de instalación local y de despliegue en Vercel (sección 12), y los documentos de la carpeta `docs/` completos. El sistema debe poder demostrarse end-to-end tanto localmente (con datos semilla) como desplegado en Vercel con Neon como base de datos.
