# Diseño: Link compartible por competencia

**Fecha:** 2026-04-16  
**Estado:** Aprobado  

---

## Objetivo

Permitir a los organizadores de competencia compartir un link legible y memorable en sus perfiles de Instagram, Facebook y otras redes sociales, que lleve directamente a la página de landing de su competencia.

---

## Arquitectura

### 1. Base de datos

Agregar campo `slug` a la tabla `competitions`:

- Tipo: `VARCHAR`, único, nullable, con índice
- Auto-generado al crear o actualizar una competencia a partir del campo `nombre`
- Algoritmo de generación:
  1. Convertir a minúsculas
  2. Reemplazar espacios y caracteres especiales por guiones
  3. Eliminar caracteres no alfanuméricos (excepto guiones)
  4. Si el slug ya existe en BD, agregar sufijo numérico: `open-de-karate-2025-2`
- Migración Alembic: agrega columna `slug VARCHAR UNIQUE` a `competitions`
- Script de backfill: genera slugs para todas las competencias existentes

### 2. Backend

**Lookup dual en endpoint existente:**

`GET /api/competitions/{id_or_slug}`

- Si el parámetro es numérico → busca por `id`
- Si el parámetro es texto → busca por `slug`
- Sin rutas nuevas — el parámetro ya es un string en FastAPI

**Generación de slug:**

- Se genera automáticamente al crear una competencia (`POST /api/competitions`)
- Se regenera al actualizar el `nombre` de una competencia (`PATCH /api/competitions/{id}`)
- El slug no es editable por el usuario

### 3. Frontend — Rutas

- La ruta `/competitions/:competitionId` ya acepta cualquier string — no requiere cambios en el router de React
- El componente `CompetitionLanding` ya usa el parámetro para hacer fetch — el backend se encarga del lookup dual
- La navegación interna de la app sigue usando IDs numéricos para evitar lookups innecesarios

### 4. Frontend — Panel del organizador

Agregar bloque **"Link para compartir"** dentro de la sección de configuración de la competencia en `/organizer`:

- Campo de texto de solo lectura con la URL completa: `https://tournamets.com/competitions/{slug}`
- Botón **"Copiar link"** al lado derecho del campo
- Al hacer clic: copia al portapapeles, el botón cambia a "¡Copiado!" por 2 segundos, luego vuelve a su estado original
- Texto de ayuda debajo: *"Comparte este link en tus redes sociales para que los participantes se inscriban"*

---

## Flujo de datos

```
Organizador crea/actualiza competencia
  → backend genera slug desde nombre
  → slug guardado en BD

Organizador abre panel → sección configuración
  → frontend muestra link: tournamets.com/competitions/{slug}
  → organizador copia link con un click

Visitante desde Instagram/Facebook hace clic en link
  → GET /api/competitions/open-de-karate-2025
  → backend detecta slug (no numérico), busca por slug
  → devuelve datos de competencia
  → frontend renderiza CompetitionLanding normalmente
```

---

## Manejo de errores

- Si el slug no existe: el backend retorna 404, el frontend muestra página de error estándar
- Si una competencia no tiene slug aún (datos legacy): el panel muestra el link con ID numérico como fallback
- Slugs con caracteres Unicode (tildes, ñ): se normalizan a ASCII antes de guardar (ej: `ñ` → `n`, `á` → `a`)

---

## Lo que NO incluye este diseño

- El slug NO es editable por el organizador
- NO hay URLs cortas tipo `/c/karate25`
- NO hay redirección automática según estado de inscripciones
- NO hay página de destino diferente — siempre va al landing existente
- NO se cambia la navegación interna de la app

---

## Archivos afectados

**Backend:**
- `server/models.py` — agregar campo `slug` a `Competition`
- `server/routers/competitions.py` — lookup dual + generación de slug
- `server/migrations/` — nueva migración Alembic + script backfill

**Frontend:**
- `client/src/pages/AdminDashboard.jsx` — agregar bloque "Link para compartir" en el modal de edición de competencia (función que renderiza el formulario de edición, cerca del campo `nombre`)
