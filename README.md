# FinalRep

App de gestion de competencias fitness con leaderboard en tiempo real.

## Estructura
```text
server/   -> FastAPI + PostgreSQL
client/   -> React + Vite
```

## Arranque rapido

### Backend (Python 3.9+)
Configura `DATABASE_URL` con una conexion PostgreSQL valida antes de iniciar el backend.

```bash
cd server
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

API disponible en `http://localhost:8000`
Docs en `http://localhost:8000/docs`

### Frontend
```bash
cd client
npm install
npm run dev
```

App disponible en `http://localhost:5173`

### Docker local
```bash
docker compose up --build
```

- Docker local levanta un PostgreSQL propio del proyecto en `localhost:5432`.
- El backend local en Docker ya no usa la base de dev; corre `alembic upgrade head` al iniciar.
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- Docs API: `http://localhost:8000/docs`
- En Docker: frontend `http://localhost:5174`
- En Docker: backend `http://localhost:8001`
- En Docker: docs `http://localhost:8001/docs`

## Variables de entorno
```env
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/finalrep
ADMIN_ID=admin
ADMIN_PASSWORD=admin123
SECRET_KEY=finalrep-secret-key-cambiar-en-produccion
PAYMENT_PROVIDER=bold
BOLD_IDENTITY_KEY=tu_llave_de_identidad
BOLD_SECRET_KEY=tu_llave_secreta
BOLD_WEBHOOK_TEST_MODE=0
```

Si corres el backend fuera de Docker, [server/.env](/C:/Users/Administrador/source/repos/tournamets/server/.env) ya quedó apuntando a ese mismo PostgreSQL local.

## Deploy automatico

`deploy.sh` levanta produccion con `docker-compose.prod.yml` y, si existe, tambien carga `docker-compose.server.local.yml`.

`deploy.auto.sh` hace:
- `git fetch origin main`
- compara `HEAD` vs `origin/main`
- `git pull --ff-only` si hay cambios
- ejecuta `./deploy.sh`

En servidor se puede programar con systemd usando:
- `ops/finalrep-autodeploy.service`
- `ops/finalrep-autodeploy.timer`

## Rutas de la app

| Ruta | Descripcion |
|------|-------------|
| `/login` | Login admin y participantes |
| `/admin` | Panel de administracion |
| `/profile` | Perfil del participante |
| `/leaderboard` | Leaderboard publico |
| `/leaderboard/:id` | Leaderboard de competencia especifica |

## Importar participantes (CSV)

Columnas aceptadas: `cedula`, `nombre`, `apellido`, `email`, `celular`, `sexo`, `categoria`

Ejemplo CSV:
```csv
cedula,nombre,apellido,email,sexo,categoria
12345678,Juan,Perez,juan@mail.com,M,Rx
87654321,Maria,Lopez,maria@mail.com,F,Scaled
```

## Categorias disponibles
Rx · Scaled · Masters · Teens · Otro

## Pagos con Bold

### Flujo de inscripcion con pago

1. El participante completa los pasos del formulario de inscripcion.
2. Al confirmar, el backend genera un `CompetitionPaymentIntent` con estado `created` y devuelve los datos del checkout de Bold.
3. El frontend abre el widget de Bold. Bold procesa el pago y notifica al backend via webhook.
4. El webhook actualiza el estado del intent (`processing` → `approved` / `rejected`) y, si es aprobado, crea la inscripcion.

### Comportamiento ante intents pendientes

Al iniciar un nuevo pago, el backend valida si ya existe un intent activo para ese participante/competencia usando la funcion `_is_payment_intent_blocking` ([server/routers/enrollments.py](server/routers/enrollments.py)):

| Estado del intent existente | Tiempo transcurrido | Resultado |
|-----------------------------|---------------------|-----------|
| `created` | < 15 min | Bloqueado — puede estar en el checkout |
| `created` | >= 15 min | Permitido — intent expirado (usuario abandono la pestana) |
| `processing` / `pending` | cualquiera | Bloqueado — Bold tiene el pago activo |
| `approved` | cualquiera | Bloqueado — ya existe un pago aprobado |
| `rejected` / `failed` | cualquiera | Permitido — puede reintentar |

**Problema que resuelve:** si un usuario cierra la pestana del checkout antes de completar el pago, el intent queda en estado `created` indefinidamente. Sin el timeout, el sistema bloquearia cualquier nuevo intento con el mensaje "Ya tienes un pago en progreso", requiriendo intervencion manual del administrador. Con el timeout de 15 minutos, el bloqueo se libera automaticamente.

El timeout se configura con la constante `_CREATED_INTENT_TIMEOUT_MINUTES` en [server/routers/enrollments.py](server/routers/enrollments.py).

## Equipos
- Se crean desde **Admin -> Equipos**
- Minimo 2, maximo 10 miembros por equipo
- Cada participante solo puede estar en **un equipo por competencia**
- El leaderboard muestra la tab `Equipos` automaticamente si hay equipos registrados
- Los resultados de equipo se cargan desde **Admin -> Resultados** seleccionando `Equipo` en lugar de participante
