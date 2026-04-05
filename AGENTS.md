# FinalRep Design Guide

Este proyecto ya no se llama `Loyalty Race` ni `OpenArena`. La marca correcta es `FinalRep`.

## Marca
- Nombre visible de producto: `FinalRep`
- Tono visual: competitivo, oscuro, moderno, atlético
- Sensación: arena, fuerza, intensidad, precisión

## Paleta base
- Fondo principal: `#0D0F12`
- Superficie / cards: `#171B21`
- Bordes / divisores: `#252A33`
- Top bar / zonas más oscuras: `#090B0E`

- Primario / CTA / highlights: `#FF6B00`
- Hover primario: `#E45E00`
- Accent secundario / estados activos / datos: `#00C2A8`

- Texto principal: `#F5F7FA`
- Texto secundario: `#AAB2C0`
- Texto apagado: `#6B7280`

- Success: `#22C55E`
- Warning: `#F59E0B`
- Error: `#EF4444`

## Gradiente de marca
- `linear-gradient(135deg, #FF6B00 0%, #FF9A3D 100%)`

## Podium
- Gold: `#D4A537`
- Silver: `#9CA3AF`
- Bronze: `#A16207`

## Reparto visual
- 70% tonos oscuros
- 20% blancos y grises de texto
- 10% acentos naranja y turquesa

## Reglas de UI
- Pantallas completas: usar fondo `#0D0F12`
- Cards, tablas, modales y paneles: usar `#171B21`
- Bordes: usar `#252A33`
- Botón principal: usar `#FF6B00`
- Botón secundario activo o filtros destacados: usar `#00C2A8`
- Evitar volver a verdes o rosas del branding anterior
- Los nombres `Loyalty Race` y `OpenArena` no deben aparecer en UI nueva ni en textos nuevos
- El texto de UI debe hablarle al usuario final y no describir la aplicacion desde afuera
- Evitar copy meta o de relleno como "aqui el usuario deberia", "esta pantalla sirve para", "esta capa muestra", "visual de respaldo" o frases similares
- En Inicio, Eventos, Workouts y Notificaciones, el copy debe ser breve, concreto y orientado a accion, contexto del evento o estado real
- Cuando se abra un modal, el scroll del fondo debe quedar bloqueado
- Cuando se abra un modal en movil, el dock inferior debe ocultarse mientras el modal siga abierto
- Si un modal tiene contenido con scroll, el control de cierre debe quedar fijo o sticky arriba para que siempre sea visible

## Implementación
- Preferir variables CSS o constantes compartidas para colores
- Si una pantalla necesita un header destacado, usar el gradiente de marca
- Si hay una decisión entre color decorativo y legibilidad, priorizar legibilidad
