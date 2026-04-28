# Athlete Public Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar `Perfiles Publicos de Atletas` completos en `FinalRep`, con identidad publica, `username` definido por el atleta, URL compartible y estable, historial competitivo, PRs, badges, comparativas, privacidad, SEO y controles administrativos.

**Architecture:** El atleta mantiene un `athlete_id` interno inmutable. La identidad publica se separa entre `display_name` y `username`. El `username` es unico, elegible por el atleta y se convierte en la URL canónica publica (`/a/{username}`). El sistema conserva aliases historicos para redirects, soporta configuracion de visibilidad por campo, expone perfiles indexables cuando el atleta los hace publicos y conecta resultados, rankings, workouts, PRs y gyms alrededor del mismo atleta.

**Tech Stack:** Python/FastAPI, SQLModel, Alembic, React/JSX, permisos por rol, metadata SEO/Open Graph

---

## File Map

| Area | Cambio |
|---|---|
| `server/models.py` o modulos equivalentes | Campos publicos del atleta, aliases de username, privacidad, badges, PRs y follows |
| `server/migrations/` | Migraciones de nuevas columnas, tablas auxiliares, indices y backfills |
| `server/routers/` | Endpoints publicos, privados, admin y comparativas |
| `server/services/` | Reglas de negocio para usernames, aliases, visibilidad, badges y comparaciones |
| `server/constants.py` | Palabras reservadas, limites y estados publicos |
| `client/src/pages/` | Perfil publico, editor de perfil, ajustes de privacidad, comparativa |
| `client/src/components/` | hero, stat cards, badges, tablas, charts, PR board, follow CTA |
| `client/src/context/` o equivalente | estado de viewer, permisos y preferencias del atleta |

---

## Phase 1: Public identity and URL model

**Outcome:** Cada atleta tiene identidad publica estable y URL unica sin depender del nombre visible.

- [ ] Agregar `display_name` publico separado del nombre legal o interno, si hoy no existe claramente
- [ ] Agregar `username` unico, editable por el atleta y obligatorio para perfil publico
- [ ] Definir `athlete_id` interno como llave inmutable para todas las relaciones
- [ ] Agregar `public_profile_enabled` y `profile_visibility` a nivel atleta
- [ ] Agregar `current_public_slug` o reutilizar `username` como clave canónica de ruta
- [ ] Crear tabla `AthleteUsernameAlias` para guardar usernames historicos y redirects
- [ ] Crear indice unico case-insensitive para `username`
- [ ] Definir normalizacion de username: lowercase, sin espacios, caracteres permitidos limitados
- [ ] Definir lista de palabras reservadas: `admin`, `api`, `events`, `eventos`, `workouts`, `login`, `signup`, `finalrep`, `rankings`, `athletes`, `gym`, `gyms` y equivalentes
- [ ] Impedir collision con rutas del producto y recursos internos

---

## Phase 2: Username selection, collisions and redirects

**Outcome:** El atleta puede elegir su `username` y el sistema resuelve duplicados sin romper enlaces.

- [ ] Crear servicio de disponibilidad de `username`
- [ ] Permitir que el atleta defina manualmente su `username` desde onboarding o edicion de perfil
- [ ] Generar sugerencias automáticas cuando el `username` ya exista
- [ ] Aplicar politica de longitud minima y maxima
- [ ] Aplicar politica de caracteres permitidos: letras, numeros, punto y guion bajo si producto lo aprueba
- [ ] Bloquear cambios repetitivos o abusivos si hace falta rate limit
- [ ] Cuando el atleta cambie `username`, mover el anterior a `AthleteUsernameAlias`
- [ ] Resolver `/a/{old_username}` con redirect 301 al `username` actual
- [ ] Registrar auditoria de cambios de identidad publica
- [ ] Definir que `display_name` puede repetirse sin ninguna restriccion

**Decision rule**

- [ ] La URL canónica publica debe ser `/a/{username}`
- [ ] El nombre grande visible en UI debe ser `display_name`
- [ ] El handle visible debajo del nombre debe ser `@username`
- [ ] Nunca usar `display_name` como llave principal de lookup

---

## Phase 3: Athlete public profile domain

**Outcome:** El backend puede servir una ficha publica completa y consistente del atleta.

- [ ] Agregar campos publicos de identidad: avatar, cover, bio corta, ciudad, pais, gym principal, division, categoria
- [ ] Agregar switches de visibilidad por campo sensible: ciudad, gym, edad, PRs, historial, followers
- [ ] Agregar tabla o estructura de `AthletePersonalRecord`
- [ ] Agregar tabla o estructura de `AthleteBadge`
- [ ] Agregar tabla o estructura de `AthleteFollow`
- [ ] Agregar tabla o estructura de `AthleteProfileView` si se quieren analytics internos
- [ ] Agregar tabla o estructura de `AthleteHighlight` para logros destacados
- [ ] Conectar resultados de eventos y workouts existentes al atleta via ID estable
- [ ] Conectar ranking global, regional y por categoria al mismo perfil
- [ ] Definir el criterio de `verified athlete` y su fuente

---

## Phase 4: Privacy, safety and moderation

**Outcome:** El perfil publico es util sin comprometer control, seguridad ni calidad.

- [ ] Permitir perfil `public`, `unlisted` o `private` si producto lo necesita
- [ ] Definir comportamiento por defecto para atletas nuevos
- [ ] Si el atleta es menor de edad, dejar perfil privado por defecto
- [ ] Permitir ocultar campos individualmente sin desactivar todo el perfil
- [ ] Agregar opcion de bloquear indexacion si el atleta no quiere SEO
- [ ] Moderar avatar, bio y cover si hay contenido reportable
- [ ] Crear endpoint administrativo para suspender perfil publico
- [ ] Crear razon de suspension visible para soporte interno
- [ ] Agregar reporte de perfil o contenido incorrecto
- [ ] Auditar cambios de privacidad y suspension

---

## Phase 5: Public API and routing

**Outcome:** El producto expone perfiles publicos robustos, comparables y compartibles.

- [ ] Crear `GET /api/athletes/public/{username}`
- [ ] Crear `GET /api/athletes/public/{username}/results`
- [ ] Crear `GET /api/athletes/public/{username}/prs`
- [ ] Crear `GET /api/athletes/public/{username}/badges`
- [ ] Crear `GET /api/athletes/public/{username}/highlights`
- [ ] Crear `GET /api/athletes/public/{username}/comparison/{other_username}` o endpoint equivalente
- [ ] Resolver aliases historicos y responder redirect canónico en frontend/backend segun arquitectura actual
- [ ] Exponer flag `is_following` cuando viewer autenticado consulta perfil
- [ ] Exponer solo campos permitidos por configuracion de visibilidad
- [ ] Separar payload de `owner view` y `public view` para no filtrar datos privados

---

## Phase 6: Public profile UI

**Outcome:** `FinalRep` tiene una ficha publica de atleta alineada con la marca y con lectura inmediata.

- [ ] Crear ruta frontend `/a/:username`
- [ ] Construir hero con fondo oscuro y header destacado con gradiente de marca
- [ ] Mostrar `display_name`, `@username`, avatar, gym, ciudad y division segun visibilidad
- [ ] Mostrar verified badge cuando aplique
- [ ] Mostrar KPIs clave arriba: ranking, puntos, eventos, workouts, podiums, streak
- [ ] Construir tabs `Resumen`, `Resultados`, `PRs`, `Badges`
- [ ] Construir bloque de highlights recientes con contexto real
- [ ] Construir historial competitivo por temporada y categoria
- [ ] Construir PR board por tipo: strength, gymnastics, endurance, benchmark
- [ ] Construir CTA `Seguir`, `Compartir`, `Comparar`
- [ ] Mantener copy breve, competitivo y orientado al estado real del atleta
- [ ] Asegurar legibilidad con paleta `FinalRep` y sin rastros de branding anterior

---

## Phase 7: Athlete settings and edit flows

**Outcome:** El atleta puede controlar su identidad publica sin fricciones ni ambiguedades.

- [ ] Agregar seccion `Perfil publico` en ajustes del atleta
- [ ] Permitir activar o desactivar perfil publico
- [ ] Permitir elegir y editar `username`
- [ ] Mostrar disponibilidad en tiempo real con sugerencias
- [ ] Explicar de forma breve que la URL publica usa `username`
- [ ] Permitir editar `display_name` sin afectar la URL
- [ ] Permitir editar bio, avatar, cover y campos visibles
- [ ] Permitir configurar privacidad por seccion
- [ ] Mostrar preview del perfil publico antes de publicar
- [ ] Confirmar al usuario cuando un cambio de `username` genere nueva URL y redirect desde la vieja

---

## Phase 8: Results, rankings, PRs and badges

**Outcome:** El perfil deja de ser una tarjeta vacia y se vuelve una ficha competitiva viva.

- [ ] Exponer resultados por evento con posicion final, categoria, score y fecha
- [ ] Exponer resultados por workout dentro de cada evento si existen
- [ ] Exponer evolucion de ranking por temporada
- [ ] Exponer PRs verificadas con fecha de actualizacion y fuente
- [ ] Diferenciar PR declarada vs PR validada si producto ya maneja verificacion
- [ ] Crear motor de badges reales y no decorativos
- [ ] Definir badges por ranking, podiums, consistencia, participacion y streaks
- [ ] Asegurar que badges y stats usen datos recalculables y auditables
- [ ] Programar recalculos o jobs cuando cambien resultados clave

---

## Phase 9: Social competitive layer

**Outcome:** El perfil impulsa discovery y retorno sin convertirse en red social genérica.

- [ ] Implementar `seguir atleta`
- [ ] Implementar contador de followers si el atleta no lo oculta
- [ ] Implementar `comparar atletas`
- [ ] Mostrar rivales relacionados o atletas comparables
- [ ] Implementar `compartir perfil` con URL canónica
- [ ] Generar Open Graph competitivo con nombre, avatar y métricas clave
- [ ] Evaluar feed de actividad del atleta solo si ya existe actividad confiable

---

## Phase 10: SEO, metadata and growth

**Outcome:** Los perfiles pueden circular fuera del producto sin perder control de marca ni coherencia.

- [ ] Definir `title`, `description`, canonical y Open Graph por atleta
- [ ] Incluir `noindex` cuando perfil no sea publico o indexable
- [ ] Agregar structured data si aporta a discoverability
- [ ] Asegurar que la pagina responde bien a crawler y share preview
- [ ] Generar sitemap solo para perfiles indexables
- [ ] Garantizar redirect correcto de aliases viejos a la URL vigente

---

## Phase 11: Admin tools and support operations

**Outcome:** El equipo puede operar usernames, conflictos, verificaciones y abusos sin parches manuales.

- [ ] Crear buscador admin por `athlete_id`, `display_name`, `username` y alias
- [ ] Permitir liberar, bloquear o reasignar usernames en casos excepcionales
- [ ] Permitir marcar atleta como verificado
- [ ] Permitir suspender perfil publico o despublicarlo
- [ ] Permitir revisar reportes y trazabilidad de cambios
- [ ] Exponer historial de usernames por atleta
- [ ] Registrar merge o dedupe de atletas si ese problema ya existe en el dominio

---

## Phase 12: Migration and backfill

**Outcome:** Los perfiles actuales migran al nuevo esquema sin romper integridad ni enlaces.

- [ ] Backfill de `display_name` desde nombre actual del atleta
- [ ] Generar `username` inicial para atletas existentes con reglas deterministas
- [ ] Resolver colisiones existentes con sufijo incremental o sugerencia estable
- [ ] Revisar manualmente usernames reservados o conflictivos
- [ ] Poblar aliases cuando existan slugs o handles viejos en otro modulo
- [ ] Reindexar resultados, rankings y PRs contra `athlete_id` estable si hoy dependen de nombres
- [ ] Validar que ninguna URL publica quede apuntando a nombres libres

---

## Validation checklist

- [ ] Dos atletas pueden compartir `display_name` sin conflicto
- [ ] Ningun `username` duplicado puede crearse aunque cambie mayusculas/minusculas
- [ ] Un cambio de `username` no rompe enlaces previos
- [ ] Ningun endpoint publico filtra datos ocultos por privacidad
- [ ] El perfil carga resultados, PRs, badges y ranking desde IDs estables
- [ ] El perfil publico respeta completamente la marca `FinalRep`
- [ ] No aparecen `Loyalty Race` ni `OpenArena` en textos nuevos ni metadatos
- [ ] El atleta entiende claramente que `display_name` y `username` cumplen funciones distintas
- [ ] Admin puede resolver conflictos de username sin tocar datos a mano en DB
- [ ] SEO solo indexa perfiles realmente publicos

---

## Delivery order recommendation

1. Modelo de identidad publica, `username` y aliases
2. Privacidad, reglas, migraciones y backfill
3. Endpoints publicos y redirects canónicos
4. Settings del atleta para editar identidad publica
5. UI de perfil publico
6. Resultados, PRs, badges y comparativas
7. SEO, follows y tooling administrativo

---

## Notes

- Este plan asume implementacion completa, no MVP.
- La decision central es que el atleta define su `username`, pero `FinalRep` garantiza unicidad, normalizacion, restricciones y redirects historicos.
- Si hoy existen perfiles o resultados que se resuelven por nombre libre, hay que migrarlos a `athlete_id` antes de confiar en comparativas o SEO.
- Si el producto quiere tambien una URL secundaria tipo nombre legible, puede existir solo como alias decorativo, nunca como llave principal.
