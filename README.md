# FinalRep 🏆

App de gestión de competencias fitness con leaderboard en tiempo real.

## Estructura
```
server/   → FastAPI + SQLite (Python)
client/   → React + Vite (Node.js)
```

## Arranque rápido

### Backend (Python 3.9+)
```bash
cd server
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
API disponible en http://localhost:8000
Docs en http://localhost:8000/docs

### Frontend
```bash
cd client
npm install
npm run dev
```
App disponible en http://localhost:5173

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

---

## Variables de entorno (`server/.env`)
```
ADMIN_ID=admin
ADMIN_PASSWORD=admin123
SECRET_KEY=loyalty-race-secret-key-cambiar-en-produccion
PAYMENT_PROVIDER=bold
BOLD_IDENTITY_KEY=tu_llave_de_identidad
BOLD_SECRET_KEY=tu_llave_secreta
BOLD_WEBHOOK_TEST_MODE=0
```

## Rutas de la app

| Ruta | Descripción |
|------|-------------|
| `/login` | Login admin y participantes |
| `/admin` | Panel de administración |
| `/profile` | Perfil del participante |
| `/leaderboard` | Leaderboard público |
| `/leaderboard/:id` | Leaderboard de competencia específica |

## Importar participantes (CSV)

Columnas aceptadas: `cedula`, `nombre`, `apellido`, `email`, `celular`, `sexo`, `categoria`

Ejemplo CSV:
```csv
cedula,nombre,apellido,email,sexo,categoria
12345678,Juan,Perez,juan@mail.com,M,Rx
87654321,Maria,Lopez,maria@mail.com,F,Scaled
```

## Categorías disponibles
Rx · Scaled · Masters · Teens · Otro

## Equipos
- Se crean desde **Admin → Equipos**
- Mínimo 2, máximo 10 miembros por equipo
- Cada participante solo puede estar en **un equipo por competencia**
- El leaderboard muestra tab "Equipos" automáticamente si hay equipos registrados
- Los resultados de equipo se cargan desde **Admin → Resultados** seleccionando "Equipo" en lugar de participante

## Nota: actualización de schema
Si ya tenías una base de datos corriendo, elimina `server/loyalty_race.db` para aplicar el nuevo schema con las tablas `teams` y `team_members`.
