# Diseno: Sistema de Gyms en FinalRep

**Fecha:** 2026-04-27  
**Estado:** Propuesto

---

## Objetivo

Construir un sistema completo de `Gyms` dentro de `FinalRep` para que:

- los usuarios puedan descubrir boxes registrados;
- cada atleta pueda vincularse a un gym existente;
- cada gym tenga una pagina publica con sus atletas, actividad y presencia competitiva;
- la plataforma pueda gobernar la calidad de los datos y verificar ownership real.

El sistema no debe depender de que todo lo cree el equipo interno ni permitir que cualquier usuario publique perfiles oficiales sin control. La solucion debe equilibrar crecimiento, moderacion y confianza.

---

## Principios del sistema

1. El directorio debe crecer rapido, pero con control.
2. La identidad oficial de un gym no se entrega sin verificacion.
3. Un atleta puede declarar su afiliacion, pero el gym controla su roster oficial.
4. Los perfiles publicos deben priorizar legibilidad, autoridad y contexto competitivo.
5. La arquitectura debe permitir monetizacion futura sin hacerla visible en la experiencia actual.

---

## Modelo operativo recomendado

`FinalRep` opera un modelo hibrido:

- cualquier usuario autenticado puede sugerir un gym;
- el equipo admin revisa y aprueba la creacion publica inicial;
- un owner o manager puede reclamar el gym;
- solo un gym reclamado y verificado puede administrar datos sensibles y su roster oficial.

Este enfoque evita tres problemas:

- crecimiento lento si todo depende del admin;
- datos basura si cualquier usuario publica sin revision;
- poca escalabilidad si solo se permite alta manual por parte del equipo.

---

## Actores y roles

### 1. Visitante

- puede ver el directorio publico de gyms;
- puede abrir la ficha publica de un gym;
- no puede sugerir, reclamar ni editar.

### 2. Atleta autenticado

- puede buscar gyms registrados;
- puede sugerir un gym nuevo;
- puede enviar solicitud de afiliacion a un gym;
- puede declarar un gym principal en su perfil;
- no puede editar datos oficiales del gym.

### 3. Owner o manager del gym

- puede reclamar un gym existente;
- puede crear una solicitud de alta de gym con intencion de ownership;
- puede administrar perfil, sedes, coaches, links, branding y roster oficial despues de verificarse;
- puede aprobar o rechazar afiliaciones oficiales.

### 4. Admin FinalRep

- aprueba o rechaza nuevas solicitudes;
- resuelve duplicados y conflictos de ownership;
- verifica owners/managers;
- modera contenido y actividad;
- puede suspender o archivar gyms.

---

## Estados del gym

Cada gym debe tener un ciclo de vida claro:

### Estado de publicacion

- `draft`: creado por owner/admin pero aun no publico.
- `pending_review`: esperando revision administrativa.
- `published`: visible en el directorio publico.
- `rejected`: rechazado por calidad, duplicado o fraude.
- `archived`: retirado del directorio, pero preservado para auditoria.
- `suspended`: oculto por incumplimiento o disputa.

### Estado de ownership

- `unclaimed`: publicado sin owner verificado.
- `claim_pending`: existe solicitud de reclamo en revision.
- `claimed`: existe owner o manager asociado, aun sin verificacion final.
- `verified`: ownership validado por FinalRep.

### Estado comercial

- `free`: perfil base.
- `pro`: herramientas operativas y branding ampliado.
- `partner`: cuenta con beneficios comerciales, placement y soporte superior.

No se debe mezclar estado de publicacion con estado comercial. Un gym puede ser `published` y seguir en plan `free`.

---

## Entidades del dominio

### `Gym`

Campos sugeridos:

- `id`
- `slug`
- `display_name`
- `legal_name`
- `short_description`
- `full_description`
- `status`
- `ownership_status`
- `plan_tier`
- `verification_badge`
- `founded_year`
- `logo_url`
- `cover_image_url`
- `primary_color`
- `accent_color`
- `country`
- `state_region`
- `city`
- `address_line`
- `geo_lat`
- `geo_lng`
- `website_url`
- `instagram_url`
- `whatsapp_url`
- `contact_email`
- `contact_phone`
- `head_coach_name`
- `is_franchise`
- `is_featured`
- `created_by_user_id`
- `claimed_by_user_id`
- `created_at`
- `updated_at`
- `published_at`

### `GymLocation`

Para boxes con multiples sedes:

- `id`
- `gym_id`
- `name`
- `country`
- `state_region`
- `city`
- `address_line`
- `geo_lat`
- `geo_lng`
- `contact_phone`
- `schedule_summary`
- `is_primary`
- `status`

### `GymClaim`

Para reclamos y ownership:

- `id`
- `gym_id`
- `requested_by_user_id`
- `role_requested`
- `evidence_type`
- `evidence_url`
- `notes`
- `status`
- `reviewed_by_admin_id`
- `reviewed_at`

### `GymMembership`

Relacion usuario-gym:

- `id`
- `gym_id`
- `user_id`
- `membership_type`
- `status`
- `requested_at`
- `approved_at`
- `approved_by_user_id`
- `ended_at`
- `is_primary`
- `visibility`

Estados recomendados:

- `declared`
- `pending_approval`
- `approved`
- `rejected`
- `removed`
- `inactive`

### `GymStaff`

Para managers, coaches y staff autorizado:

- `id`
- `gym_id`
- `user_id`
- `role`
- `status`
- `permissions_scope`

### `GymSubmission`

Para sugerencias iniciales o alta nueva:

- `id`
- `submitted_by_user_id`
- `proposed_name`
- `country`
- `state_region`
- `city`
- `instagram_url`
- `website_url`
- `contact_name`
- `contact_email`
- `submission_type`
- `notes`
- `status`
- `matched_gym_id`
- `reviewed_by_admin_id`
- `reviewed_at`

### `GymAuditLog`

Para trazabilidad:

- `id`
- `gym_id`
- `actor_user_id`
- `action_type`
- `before_snapshot`
- `after_snapshot`
- `created_at`

---

## Reglas de negocio

### Alta de gyms

- ningun gym nuevo se publica automaticamente sin revision;
- antes de crear uno nuevo, el sistema debe buscar posibles duplicados por nombre, ciudad y redes;
- si hay match fuerte, se invita a reclamar el gym existente en vez de crear uno nuevo;
- los usuarios comunes solo pueden sugerir, no publicar perfiles oficiales completos.

### Reclamo de ownership

- un owner o manager debe aportar evidencia minima;
- evidencia valida: correo del dominio oficial, DM desde Instagram oficial, documento comercial o validacion manual por admin;
- un mismo gym puede tener varios managers, pero debe existir un owner principal o cuenta responsable.

### Afiliacion de atletas

- el atleta puede seleccionar un gym al registrarse o editar su perfil;
- esa relacion puede quedar en `declared` mientras el gym aun no la aprueba;
- el gym verificado puede aprobar el roster oficial;
- el perfil publico del gym puede distinguir:
  - atletas vinculados;
  - atletas oficiales;
- un atleta puede tener historial de gyms, pero solo un gym primario activo para ranking y perfil principal.

### Edicion de datos sensibles

Solo admin o staff del gym con permisos pueden editar:

- nombre oficial;
- ciudad o direccion;
- links de contacto;
- branding;
- sedes;
- staff;
- descripcion publica principal.

### Duplicados y merges

- si se detectan gyms duplicados, admin debe tener flujo de merge;
- las afiliaciones, claims y analytics deben preservarse al fusionar;
- el slug viejo debe poder redirigir al nuevo para no romper links compartidos.

---

## Experiencia de usuario

### Tab publico `Gyms`

Debe incluir:

- buscador por nombre;
- filtros por pais, ciudad, estado de verificacion y cantidad de atletas;
- cards con logo, nombre, ciudad, badge y numero de atletas;
- orden por relevancia y actividad reciente;
- CTA claro para `Ver gym`.

### Ficha publica del gym

Debe incluir:

- cover + logo;
- nombre, badge y ubicacion;
- descripcion breve;
- roster de atletas;
- coaches o staff principal;
- proximos eventos;
- resultados o presencia competitiva reciente;
- enlaces de contacto y redes;
- CTA para `Solicitar afiliacion` o `Reclamar gym`.

### Onboarding de atleta

En el registro o edicion de perfil:

- buscar gym existente;
- seleccionar gym principal;
- si no existe, sugerir nuevo gym;
- mostrar estado de afiliacion;
- si la afiliacion esta pendiente, informarlo sin bloquear el alta del usuario.

### Console de gym manager

Un panel completo debe permitir:

- editar perfil publico;
- administrar sedes;
- revisar solicitudes de afiliacion;
- aprobar o rechazar atletas;
- invitar staff;
- revisar contactos y solicitudes.

---

## Permisos por rol

### Usuario normal

- ver directorio;
- sugerir gym;
- solicitar afiliacion;
- declarar gym en su perfil;
- reportar informacion incorrecta.

### Staff del gym

- editar perfil segun permiso;
- gestionar afiliaciones;
- administrar sedes;
- descargar reportes.

### Owner verificado

- todo lo anterior;
- administrar plan;
- asignar managers;
- aprobar branding y perfil oficial;
- iniciar cambios sensibles que requieran revision.

### Admin

- aprobar gyms;
- aprobar claims;
- resolver disputas;
- fusionar duplicados;
- suspender perfiles;
- editar cualquier dato;
- aplicar badges y planes.

---

## Moderacion y confianza

El sistema necesita controles explicitos:

- deteccion de duplicados por nombre + ciudad + redes;
- cola administrativa de `submissions`, `claims` y `reports`;
- bitacora de cambios sensibles;
- reportes de usuarios para datos falsos;
- suspension temporal mientras se resuelve un conflicto de ownership;
- historial de ownership para evitar secuestros de cuenta o cambios opacos.

---

## Monetizacion futura

La monetizacion queda fuera del alcance visible de la etapa actual.

Por ahora:

- no debe haber planes visibles en UI;
- no debe haber badges, labels o CTAs que insinuen pago o promocion;
- no debe haber diferenciacion publica entre gyms por motivos comerciales;
- no debe existir billing, checkout ni pantallas comerciales para gyms.

La arquitectura puede conservar campos internos como `plan_tier` o `is_featured`, pero deben permanecer inactivos y sin expresion visible hasta una fase futura.

---

## KPIs del sistema

Producto y negocio deben medir:

- gyms publicados;
- gyms reclamados;
- gyms verificados;
- tasa de conversion de `submission` a `published`;
- tasa de conversion de `claim` a `verified`;
- afiliaciones solicitadas, aprobadas y rechazadas;
- porcentaje de atletas con gym primario;
- visitas a fichas de gym;
- duplicados detectados y resueltos.

---

## Riesgos y mitigaciones

### Riesgo: duplicados

Mitigacion:

- busqueda previa obligatoria;
- scoring de coincidencias;
- merge administrativo.

### Riesgo: reclamos falsos

Mitigacion:

- claim con evidencia;
- revision admin;
- suspension ante conflicto.

### Riesgo: roster manipulado

Mitigacion:

- separar `declared` de `approved`;
- historial de afiliaciones;
- acciones auditables.

### Riesgo: directorio vacio o pobre

Mitigacion:

- permitir sugerencias de usuarios;
- seeding inicial por admin;
- outreach comercial a boxes relevantes.

## Decision recomendada

`FinalRep` debe lanzar `Gyms` como una capa estructural del producto, no como un campo de perfil aislado.

La recomendacion es:

- abrir el directorio publico;
- permitir sugerencias de alta;
- conservar aprobacion administrativa;
- habilitar claim y verificacion;
- separar afiliacion declarada de roster oficial;
- dejar monetizacion fuera de la experiencia actual y retomarla solo cuando la operacion base este estable.

Este modelo sostiene crecimiento, orden operativo y una oferta B2B defendible.

---

## Plan por fases

### Fase 1 - Fundacion del dominio

- crear entidades `Gym`, `GymSubmission`, `GymClaim`, `GymMembership`, `GymStaff` y `GymAuditLog`;
- definir estados, permisos y trazabilidad;
- agregar slugs, validaciones y reglas anti-duplicado;
- preparar backoffice de revision administrativa.

### Fase 2 - Directorio publico y perfil de gym

- construir tab `Gyms`;
- agregar filtros, buscador y ordenamiento;
- crear ficha publica del gym;
- mostrar atletas, estado de verificacion y actividad competitiva.

### Fase 3 - Onboarding y afiliaciones

- integrar selector de gym en registro y perfil;
- habilitar sugerencia de gym nuevo;
- agregar flujo de solicitud de afiliacion;
- distinguir afiliacion declarada, pendiente y oficial.

### Fase 4 - Claim, verificacion y staff

- crear flujo de `Reclamar gym`;
- capturar evidencia y cola de revision;
- habilitar roles de owner, manager y coach;
- bloquear cambios sensibles segun permisos y verificacion.

### Fase 5 - Console operativa del gym

- panel de gestion del gym;
- administracion de perfil, branding y sedes;
- gestion de roster y staff;
- historial de cambios y herramientas de soporte.

### Fase 6 - Integracion profunda con FinalRep

- vincular gyms con eventos, rankings y resultados;
- permitir vistas por delegacion de atletas;
- generar paginas comparativas, performance y presencia competitiva;
- consolidar el gym como unidad principal del ecosistema competitivo.

### Fase 7 - Monetizacion futura

- evaluar planes `pro` y `partner` solo despues de estabilizar operacion y adopcion;
- definir que valor operativo real merece cobro;
- activar billing y visibilidad comercial unicamente cuando haya demanda validada.
