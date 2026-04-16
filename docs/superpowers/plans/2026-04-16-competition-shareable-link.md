# Competition Shareable Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un slug auto-generado a cada competencia y mostrar un botón "Copiar link" en el panel del organizador para facilitar compartir la competencia en redes sociales.

**Architecture:** Se agrega campo `slug` al modelo `Competition`, se genera automáticamente desde el nombre al crear/actualizar, y el endpoint de lookup acepta tanto ID numérico como slug de texto. El frontend muestra el link completo con un botón de copiar en el modal de edición de competencia.

**Tech Stack:** Python/FastAPI, SQLModel, Alembic (backend) · React/JSX, Clipboard API (frontend)

---

## File Map

| Archivo | Cambio |
|---|---|
| `server/models.py` | Agregar campo `slug` a `Competition` |
| `server/routers/competitions.py` | Función `_generate_slug`, lookup dual, llamadas en create/update |
| `server/migrations/versions/0003_competition_slug.py` | Nueva migración Alembic + backfill |
| `client/src/pages/AdminDashboard.jsx` | Bloque "Link para compartir" en `CompetitionEditorModal` |

---

## Task 1: Migración Alembic — agregar columna `slug`

**Files:**
- Create: `server/migrations/versions/0003_competition_slug.py`

- [ ] **Step 1: Crear el archivo de migración**

Crear `server/migrations/versions/0003_competition_slug.py` con este contenido exacto:

```python
"""add slug to competitions

Revision ID: 0003_competition_slug
Revises: 0002_interest_notifications
Create Date: 2026-04-16
"""
from alembic import op


revision = "0003_competition_slug"
down_revision = "0002_interest_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE competitions
        ADD COLUMN IF NOT EXISTS slug VARCHAR UNIQUE
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_competitions_slug ON competitions (slug)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_competitions_slug")
    op.execute("ALTER TABLE competitions DROP COLUMN IF EXISTS slug")
```

- [ ] **Step 2: Aplicar la migración**

Desde `server/`:
```bash
cd server && alembic upgrade head
```

Salida esperada:
```
INFO  [alembic.runtime.migration] Running upgrade 0002_interest_notifications -> 0003_competition_slug, add slug to competitions
```

- [ ] **Step 3: Verificar columna en BD**

```bash
cd server && python -c "
from database import engine
from sqlalchemy import text, inspect
insp = inspect(engine)
cols = [c['name'] for c in insp.get_columns('competitions')]
print('slug' in cols, cols)
"
```

Salida esperada: `True [... 'slug' ...]`

- [ ] **Step 4: Commit**

```bash
git add server/migrations/versions/0003_competition_slug.py
git commit -m "feat: add slug column to competitions table"
```

---

## Task 2: Función de generación de slug en backend

**Files:**
- Modify: `server/routers/competitions.py`

- [ ] **Step 1: Agregar imports necesarios**

En `server/routers/competitions.py`, la línea 1 ya tiene `import re`. Agregar `import unicodedata` justo debajo del bloque de imports estándar (líneas 1-6). El bloque de imports debe quedar:

```python
import io
import json
import os
import re
import unicodedata
from datetime import datetime, time, timezone
from pathlib import Path
from typing import List, Optional
```

- [ ] **Step 2: Agregar función `_generate_slug` después de la línea `HEX_COLOR_RE = re.compile(...)`**

Ubicar la línea (aproximadamente línea 49):
```python
HEX_COLOR_RE = re.compile(r"^#([0-9a-fA-F]{6})$")
```

Agregar después de esa línea:

```python

def _generate_slug(nombre: str, session, exclude_id: int | None = None) -> str:
    """Generate a unique URL-safe slug from a competition name."""
    # Normalize unicode (á→a, ñ→n, etc.)
    normalized = unicodedata.normalize("NFKD", nombre)
    ascii_str = normalized.encode("ascii", "ignore").decode("ascii")
    # Lowercase, replace non-alphanumeric with hyphens
    slug_base = re.sub(r"[^a-z0-9]+", "-", ascii_str.lower()).strip("-")
    if not slug_base:
        slug_base = "competencia"

    # Ensure uniqueness
    candidate = slug_base
    counter = 2
    while True:
        query = select(Competition).where(Competition.slug == candidate)
        if exclude_id is not None:
            query = query.where(Competition.id != exclude_id)
        existing = session.exec(query).first()
        if not existing:
            return candidate
        candidate = f"{slug_base}-{counter}"
        counter += 1
```

- [ ] **Step 3: Verificar sintaxis**

```bash
cd server && python -c "import routers.competitions; print('OK')"
```

Salida esperada: `OK`

- [ ] **Step 4: Commit**

```bash
git add server/routers/competitions.py
git commit -m "feat: add _generate_slug helper to competitions router"
```

---

## Task 3: Agregar campo `slug` al modelo `Competition`

**Files:**
- Modify: `server/models.py`

- [ ] **Step 1: Agregar campo `slug` a la clase `Competition`**

En `server/models.py`, ubicar la clase `Competition` (línea 109). El campo `created_at` es el último campo del modelo (aproximadamente línea 187). Agregar `slug` después del campo `organizer_user_id` y antes de `created_at`:

Encontrar:
```python
    organizer_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True),
    )
    created_at: Optional[datetime] = Field(
```

Reemplazar con:
```python
    organizer_user_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("app_users.id", ondelete="SET NULL"), nullable=True),
    )
    slug: Optional[str] = Field(default=None, index=True)
    created_at: Optional[datetime] = Field(
```

- [ ] **Step 2: Verificar que el modelo carga correctamente**

```bash
cd server && python -c "from models import Competition; print([f.name for f in Competition.model_fields.values() if hasattr(f, 'name')]); print('slug' in Competition.model_fields)"
```

Salida esperada incluye: `True`

- [ ] **Step 3: Commit**

```bash
git add server/models.py
git commit -m "feat: add slug field to Competition model"
```

---

## Task 4: Backfill de slugs para competencias existentes

**Files:**
- Modify: `server/migrations/versions/0003_competition_slug.py`

- [ ] **Step 1: Agregar backfill al upgrade de la migración**

En `server/migrations/versions/0003_competition_slug.py`, reemplazar la función `upgrade` completa:

```python
def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE competitions
        ADD COLUMN IF NOT EXISTS slug VARCHAR UNIQUE
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_competitions_slug ON competitions (slug)
        """
    )
    # Backfill: generate slugs for existing competitions
    # Uses pure SQL to avoid importing app models in migration
    op.execute(
        """
        UPDATE competitions
        SET slug = subquery.candidate
        FROM (
            SELECT
                id,
                LOWER(REGEXP_REPLACE(
                    REGEXP_REPLACE(
                        convert_to(
                            nombre,
                            'UTF8'
                        )::text,
                        '[^a-zA-Z0-9]+', '-', 'g'
                    ),
                    '^-+|-+$', '', 'g'
                )) AS candidate
            FROM competitions
            WHERE slug IS NULL
        ) AS subquery
        WHERE competitions.id = subquery.id
        """
    )
```

> **Nota:** Este backfill SQL no normaliza tildes (eso lo hace el código Python). Los slugs existentes pueden tener tildes transliteradas incorrectamente, pero es aceptable para datos legacy. El código Python en `_generate_slug` sí normaliza correctamente para nuevas competencias.

- [ ] **Step 2: Como la migración ya fue aplicada (columna existe), correr el backfill manualmente**

```bash
cd server && python -c "
from database import engine
from sqlalchemy import text
import re, unicodedata

def make_slug(nombre):
    normalized = unicodedata.normalize('NFKD', nombre)
    ascii_str = normalized.encode('ascii', 'ignore').decode('ascii')
    return re.sub(r'[^a-z0-9]+', '-', ascii_str.lower()).strip('-') or 'competencia'

with engine.connect() as conn:
    rows = conn.execute(text('SELECT id, nombre FROM competitions WHERE slug IS NULL')).fetchall()
    for row in rows:
        slug_base = make_slug(row.nombre)
        candidate = slug_base
        counter = 2
        while True:
            existing = conn.execute(text('SELECT id FROM competitions WHERE slug = :s AND id != :id'), {'s': candidate, 'id': row.id}).fetchone()
            if not existing:
                break
            candidate = f'{slug_base}-{counter}'
            counter += 1
        conn.execute(text('UPDATE competitions SET slug = :s WHERE id = :id'), {'s': candidate, 'id': row.id})
        print(f'  {row.id}: {row.nombre!r} -> {candidate!r}')
    conn.commit()
print('Backfill complete')
"
```

Salida esperada: lista de competencias con sus slugs generados, luego `Backfill complete`.

- [ ] **Step 3: Commit**

```bash
git add server/migrations/versions/0003_competition_slug.py
git commit -m "feat: add slug backfill for existing competitions"
```

---

## Task 5: Lookup dual (ID o slug) en endpoint público

**Files:**
- Modify: `server/routers/competitions.py`

El endpoint principal que usa `CompetitionLanding` es `GET /api/competitions/{competition_id}/public` (línea 486). El parámetro actualmente es `competition_id: int`. Hay que cambiar a `Union[int, str]` para soportar lookup por slug.

- [ ] **Step 1: Agregar `Union` a los imports de `typing`**

Cambiar:
```python
from typing import List, Optional
```
Por:
```python
from typing import List, Optional, Union
```

- [ ] **Step 2: Crear helper `_resolve_competition`**

Agregar después de `_generate_slug`:

```python

def _resolve_competition(session, id_or_slug: Union[int, str]) -> Competition:
    """Lookup competition by numeric ID or text slug."""
    id_or_slug_str = str(id_or_slug)
    if id_or_slug_str.isdigit():
        competition = session.get(Competition, int(id_or_slug_str))
    else:
        competition = session.exec(
            select(Competition).where(Competition.slug == id_or_slug_str)
        ).first()
    if not competition:
        raise HTTPException(404, "Competencia no encontrada")
    return competition
```

- [ ] **Step 3: Cambiar firma del endpoint `get_public_competition_detail`**

Ubicar (línea ~486):
```python
@router.get("/{competition_id}/public")
def get_public_competition_detail(
    competition_id: int,
    session: Session = Depends(get_session),
    user=Depends(get_current_user_optional),
):
    competition = session.get(Competition, competition_id)
    if not competition:
        raise HTTPException(404, "Competencia no encontrada")
```

Reemplazar con:
```python
@router.get("/{competition_id}/public")
def get_public_competition_detail(
    competition_id: str,
    session: Session = Depends(get_session),
    user=Depends(get_current_user_optional),
):
    competition = _resolve_competition(session, competition_id)
    competition_id_int = competition.id
```

- [ ] **Step 4: Reemplazar usos de `competition_id` por `competition_id_int` dentro de `get_public_competition_detail`**

Dentro de esa función, todas las referencias a `competition_id` como entero (en queries SQL y lógica) deben usar `competition_id_int`. Buscar en el cuerpo de la función (líneas ~510-625):

```python
    if not competition.activa:
        scoped_user = user
        if user and user.get("role") != "admin" and has_organizer_access(user):
            scoped_user = {**user, "staff_mode": "organizer"}
        owned_ids = get_owned_competition_ids(session, scoped_user)
        can_preview = bool(
            user
            and (
                user.get("role") == "admin"
                or (is_organizer_user(scoped_user) and competition_id in owned_ids)
            )
        )
```

Reemplazar `competition_id in owned_ids` con `competition_id_int in owned_ids`.

Luego buscar todas las demás ocurrencias de `{"cid": competition_id}` dentro de esa función y cambiarlas a `{"cid": competition_id_int}`. También `_leaderboard_public_url(competition_id)` → `_leaderboard_public_url(competition_id_int)` y `compute_phase_status_map(session, competition_id)` → `compute_phase_status_map(session, competition_id_int)`.

- [ ] **Step 5: Verificar sintaxis**

```bash
cd server && python -c "import routers.competitions; print('OK')"
```

Salida esperada: `OK`

- [ ] **Step 6: Probar manualmente con curl (o equivalente)**

Con el servidor corriendo, probar con slug de una competencia existente:
```bash
curl -s http://localhost:8000/api/competitions/SLUG_AQUI/public | python -m json.tool | head -20
```

Reemplazar `SLUG_AQUI` con un slug real del backfill. Debe retornar los datos de la competencia.

- [ ] **Step 7: Commit**

```bash
git add server/routers/competitions.py
git commit -m "feat: support slug lookup in public competition endpoint"
```

---

## Task 6: Auto-generar slug al crear y actualizar competencias

**Files:**
- Modify: `server/routers/competitions.py`

- [ ] **Step 1: Llamar `_generate_slug` en `create_competition`**

En `create_competition` (línea ~644), antes de:
```python
    competition = Competition.model_validate(payload)
    session.add(competition)
    session.commit()
    session.refresh(competition)
    return competition
```

Agregar:
```python
    payload["slug"] = _generate_slug(payload["nombre"], session)
    competition = Competition.model_validate(payload)
    session.add(competition)
    session.commit()
    session.refresh(competition)
    return competition
```

- [ ] **Step 2: Llamar `_generate_slug` en `update_competition` cuando `nombre` cambia**

En `update_competition` (línea ~684), antes de:
```python
    for field, value in data.items():
        setattr(c, field, value)

    session.add(c)
```

Agregar:
```python
    if "nombre" in data and data["nombre"] and data["nombre"].strip() != c.nombre:
        data["slug"] = _generate_slug(data["nombre"], session, exclude_id=competition_id)
    for field, value in data.items():
        setattr(c, field, value)

    session.add(c)
```

- [ ] **Step 3: Verificar sintaxis**

```bash
cd server && python -c "import routers.competitions; print('OK')"
```

Salida esperada: `OK`

- [ ] **Step 4: Probar creación de competencia**

Con el servidor corriendo, crear una competencia de prueba y verificar que tiene slug:
```bash
curl -s -X POST http://localhost:8000/api/competitions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_AQUI" \
  -d '{"nombre": "Test Slug Competencia 2026"}' | python -m json.tool | grep slug
```

Salida esperada: `"slug": "test-slug-competencia-2026"`

- [ ] **Step 5: Commit**

```bash
git add server/routers/competitions.py
git commit -m "feat: auto-generate slug on competition create and update"
```

---

## Task 7: Bloque "Link para compartir" en el panel del organizador

**Files:**
- Modify: `client/src/pages/AdminDashboard.jsx`

El bloque va en `CompetitionEditorModal` (línea ~2386), dentro de la sección `basics` (donde está "Base de la competencia", línea ~3297). Se agrega después de la cuadrícula de Nombre/Lugar, solo cuando `isEdit` es true y la competencia tiene slug.

- [ ] **Step 1: Agregar estado `linkCopied`**

En `CompetitionEditorModal`, dentro del bloque de `useState` (línea ~2438), agregar después de `const [showPhonePrefixDropdown, setShowPhonePrefixDropdown] = useState(false)`:

```javascript
  const [linkCopied, setLinkCopied] = useState(false)
```

- [ ] **Step 2: Agregar función `handleCopyLink`**

Inmediatamente después de la línea recién agregada:

```javascript
  const handleCopyLink = () => {
    const slug = competition?.slug
    if (!slug) return
    const url = `${window.location.origin}/competitions/${slug}`
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    })
  }
```

- [ ] **Step 3: Agregar bloque UI después de la cuadrícula Nombre/Lugar**

Ubicar en la sección `basics` (línea ~3302), después del cierre del `</div>` que contiene la cuadrícula de Nombre/Lugar:

```jsx
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Nombre *</label>
              <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Lugar</label>
              <input value={form.lugar} onChange={e => setForm(f => ({ ...f, lugar: e.target.value }))} placeholder="Ej: Bogota, Coliseo Central" />
            </div>
          </div>
```

Agregar inmediatamente después del cierre `</div>` de esa cuadrícula (no dentro):

```jsx
          {isEdit && competition?.slug && (
            <div style={{ marginTop: 4 }}>
              <label style={{ fontSize: 12, color: 'var(--oa-text-secondary)', marginBottom: 6, display: 'block' }}>Link para compartir</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  readOnly
                  value={`${window.location.origin}/competitions/${competition.slug}`}
                  style={{ flex: 1, background: 'rgba(13,15,18,0.6)', color: '#AAB2C0', cursor: 'default', fontSize: 13 }}
                  onFocus={e => e.target.select()}
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  style={{
                    padding: '0 16px',
                    height: 38,
                    borderRadius: 8,
                    border: '1px solid #252A33',
                    background: linkCopied ? 'rgba(94,234,212,0.12)' : 'rgba(255,255,255,0.06)',
                    color: linkCopied ? '#5EEAD4' : '#F5F7FA',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s',
                  }}
                >
                  {linkCopied ? '¡Copiado!' : 'Copiar link'}
                </button>
              </div>
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: 5 }}>
                Comparte este link en tus redes sociales para que los participantes se inscriban
              </div>
            </div>
          )}
```

- [ ] **Step 4: Verificar que el frontend compila sin errores**

```bash
cd client && npm run build 2>&1 | tail -20
```

Salida esperada: sin errores de compilación.

- [ ] **Step 5: Probar manualmente en el navegador**

1. Iniciar el servidor de desarrollo: `cd client && npm run dev`
2. Abrir el panel del organizador en `/organizer`
3. Abrir el modal de edición de una competencia existente
4. Ir a la pestaña de configuración → sección "Base de la competencia"
5. Verificar que aparece el campo "Link para compartir" con la URL correcta
6. Hacer clic en "Copiar link" → el botón debe cambiar a "¡Copiado!" por 2 segundos
7. Pegar en el navegador → debe navegar a la página de la competencia

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/AdminDashboard.jsx
git commit -m "feat: add shareable link block to competition editor modal"
```

---

## Self-Review

**Spec coverage:**
- ✅ Slug auto-generado desde nombre (Task 2 + Task 6)
- ✅ Unicidad del slug con sufijo numérico (Task 2, `_generate_slug`)
- ✅ Normalización Unicode tildes/ñ (Task 2, `unicodedata.normalize`)
- ✅ Migración Alembic (Task 1)
- ✅ Backfill para datos existentes (Task 4)
- ✅ Lookup dual ID/slug en endpoint público (Task 5)
- ✅ Bloque UI en panel organizador con campo de solo lectura (Task 7)
- ✅ Botón "Copiar link" con feedback "¡Copiado!" 2 segundos (Task 7)
- ✅ Texto de ayuda (Task 7)
- ✅ Fallback: bloque solo se muestra si `competition?.slug` existe (Task 7, Step 3)

**No hay placeholders ni TBDs.**

**Consistencia de tipos:** `_generate_slug(nombre, session, exclude_id)` definido en Task 2, usado en Task 6 con los mismos parámetros. `_resolve_competition(session, id_or_slug)` definido y usado en Task 5.
