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

## Equipos
- Se crean desde **Admin -> Equipos**
- Minimo 2, maximo 10 miembros por equipo
- Cada participante solo puede estar en **un equipo por competencia**
- El leaderboard muestra la tab `Equipos` automaticamente si hay equipos registrados
- Los resultados de equipo se cargan desde **Admin -> Resultados** seleccionando `Equipo` en lugar de participante
