# Gyms Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el sistema completo base de `Gyms` en `FinalRep`, incluyendo directorio publico, ownership, afiliaciones, console operativa, moderacion administrativa e integracion competitiva. La monetizacion queda pospuesta.

**Architecture:** El dominio `Gym` se convierte en una entidad central del producto. El backend administra alta, claims, membresias, staff y auditoria. El frontend expone directorio, ficha publica, onboarding de afiliaciones, console de managers y herramientas administrativas. Los campos comerciales internos pueden existir, pero no deben aparecer en UI ni alterar la experiencia actual.

**Tech Stack:** Python/FastAPI, SQLModel, Alembic, permisos por rol en backend, React/JSX en frontend

---

## File Map

| Area | Cambio |
|---|---|
| `server/models.py` o modulos equivalentes | Modelos de gyms, memberships, claims, staff y audit log |
| `server/migrations/` | Migraciones de nuevas tablas e indices |
| `server/routers/` | Endpoints publicos, privados y administrativos |
| `server/services/` si aplica | Reglas de negocio de claims, afiliaciones, merge y verificacion |
| `client/src/pages/` | Tab `Gyms`, ficha publica, flows de claim y admin |
| `client/src/components/` | cards, filtros, tablas, modales y badges |
| `client/src/context/` o equivalente | permisos, estado de perfil y console |

---

## Phase 1: Domain and persistence

**Outcome:** La base del sistema queda lista para soportar publicaciones, ownership, afiliaciones, staff y auditoria.

- [x] Crear modelo `Gym` con slug, estado, ownership y plan comercial
- [x] Crear modelo `GymLocation` para sedes multiples
- [x] Crear modelo `GymSubmission` para sugerencias y altas iniciales
- [x] Crear modelo `GymClaim` para reclamos de ownership
- [x] Crear modelo `GymMembership` para relacion atleta-gym
- [x] Crear modelo `GymStaff` para owner, manager y coach
- [x] Crear modelo `GymAuditLog` para trazabilidad
- [x] Agregar indices por slug, nombre, ciudad, estado y owner
- [x] Crear migraciones Alembic y backfills necesarios

---

## Phase 2: Business rules and permissions

**Outcome:** El sistema ya diferencia claramente entre sugerencia, publicacion, claim, verificacion y roster oficial.

- [x] Implementar maquina de estados de `Gym`
- [x] Implementar maquina de estados de `GymMembership`
- [x] Implementar flujo de claim con evidencia
- [x] Implementar aprobacion administrativa de submissions y claims
- [x] Implementar permisos por rol para owner, manager, coach y admin
- [x] Restringir cambios sensibles a usuarios autorizados
- [x] Registrar eventos relevantes en `GymAuditLog`
- [x] Agregar reglas anti-duplicado previas al alta

---

## Phase 3: Public directory and gym profile

**Outcome:** Los usuarios y visitantes pueden descubrir gyms y navegar a su ficha publica.

- [x] Crear endpoint listado de gyms con filtros y busqueda
- [x] Crear endpoint de detalle publico por `slug`
- [x] Exponer datos publicos de atletas, sedes y actividad
- [x] Construir tab `Gyms` en frontend
- [x] Construir cards de gym con badges y metricas clave
- [x] Construir ficha publica del gym con roster, staff y contacto
- [x] Incluir CTA para `Solicitar afiliacion` y `Reclamar gym`

---

## Phase 4: Athlete affiliation flows

**Outcome:** El atleta puede elegir gym, sugerir uno nuevo y gestionar su estado de vinculacion.

- [x] Integrar selector de gym en registro
- [x] Integrar selector de gym en edicion de perfil
- [x] Permitir sugerir gym nuevo desde onboarding o perfil cuando no exista match
- [x] Crear flujo `declared` y `pending_approval`
- [x] Permitir solo un gym activo y representativo por atleta
- [x] Exponer historial de afiliaciones del atleta
- [x] Mostrar estado de vinculacion en perfil y ficha del gym
- [x] Mostrar atletas vinculados en gyms sin owner y roster oficial solo en gyms reclamados

---

## Phase 5: Claim, verification and staff console

**Outcome:** Los boxes pueden operar su presencia dentro de FinalRep con control de ownership y staff.

- [x] Crear pagina o modal de `Reclamar gym`
- [x] Capturar evidencia y notas del solicitante
- [x] Crear inbox administrativo para revision de claims
- [x] Habilitar asignacion de owner principal y managers
- [x] Habilitar invitacion y gestion de staff
- [x] Construir console de gym manager
- [x] Permitir edicion de branding, descripcion, sedes y contacto
- [x] Permitir aprobar y rechazar afiliaciones

---

## Phase 6: Admin operations and moderation

**Outcome:** El equipo de FinalRep puede operar el sistema sin perder control ni calidad de datos.

- [x] Crear listado administrativo de submissions, claims y reports
- [x] Crear acciones de aprobar, rechazar, suspender y archivar
- [x] Implementar merge de gyms duplicados
- [x] Preservar memberships, claims y analytics en merges
- [x] Agregar reportes de informacion incorrecta
- [x] Crear bitacora visible para soporte interno

---

## Phase 7: Product integration with competitions and rankings

**Outcome:** `Gyms` deja de ser un directorio aislado y se vuelve parte del ecosistema competitivo de `FinalRep`.

- [ ] Relacionar gyms con competencias inscritas
- [ ] Relacionar gyms con resultados y rankings
- [ ] Mostrar representacion del gym por evento
- [ ] Crear vistas de atletas por gym y temporada
- [ ] Crear comparativas entre gyms y presencia competitiva
- [ ] Habilitar historias o logros destacados del gym

---

## Phase 8: Monetization future backlog

**Outcome:** La monetizacion queda documentada para una etapa futura, sin ningun impacto visible en la experiencia actual.

- [ ] Mantener `plan_tier` y `is_featured` sin uso visible en frontend
- [ ] Evitar badges, labels o ranking comercial en directorio y perfil publico
- [ ] Evaluar billing solo cuando el sistema base este estable
- [ ] Diseñar propuesta comercial sin afectar UX publica actual

---

## Validation checklist

- [ ] No existe publicacion automatica de gyms sin revision
- [ ] No existe ownership oficial sin claim ni evidencia
- [ ] Un atleta no entra al roster oficial sin aprobacion o regla valida
- [ ] Los cambios sensibles quedan auditados
- [ ] El directorio responde bien con multiples filtros
- [ ] El sistema de roles evita ediciones indebidas
- [ ] No existe ninguna señal visible de monetizacion en UI actual

---

## Delivery order recommendation

1. Persistencia y reglas del dominio
2. Directorio y ficha publica
3. Afiliaciones de atletas
4. Claim, verificacion y console de gyms
5. Backoffice admin
6. Integracion con eventos y rankings
7. Monetizacion futura

---

## Notes

- Este plan asume una implementacion completa, no un MVP reducido.
- Estado actual: ya existe ruta protegida para sugerir gyms, listado admin real de gyms y navegacion admin corregida por `slug`.
- Estado actual: el perfil del atleta ya trata `Gyms` como una sola representacion activa y deja el resto como historial visible en modal.
- Estado actual: un gym sin owner no queda vacio en el directorio; muestra atletas vinculados `declared/pending/approved`, mientras que los gyms con owner muestran solo roster oficial `approved`.
- Si el codigo actual mezcla perfil de usuario y gym en una sola tabla o flujo, conviene separar responsabilidades antes de construir UI avanzada.
- Si ya existen eventos, rankings o resultados con relaciones indirectas a gyms, la integracion debe apoyarse en IDs estables y no en nombres libres.
