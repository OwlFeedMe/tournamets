# Open clasificatorio

En el panel del organizador: competencia → Inscripciones → Open clasificatorio.
Configurar antes de recibir inscripciones o iniciar pagos. Disponible para
categorías individuales; la inscripción de equipos requiere definir primero
si la entrega y la clasificación serán por atleta o por equipo.

- Precio del Open obligatorio, mayor a cero.
- Apertura opcional de entregas y fecha límite en la zona horaria de la competencia, instrucciones y campos
  de texto/número. Video por enlace HTTP(S) o archivo MP4/MOV/WebM hasta 100 MB.
- Pago final: precio completo de la categoría, diferencia sin incluir servicio,
  porcentaje de descuento, sin pago adicional o precio por confirmar. Se aplica el servicio habitual
  a cada cobro mayor a cero.
- Las condiciones se congelan con la primera preinscripción o intento de pago. Cada pago
  inicial conserva precio final, reglas, términos y aceptación en su snapshot.

El atleta entra por `/competitions/:id/open`, también desde la inscripción
normal o desde Mis eventos. Crear una cuenta no inscribe automáticamente a una competencia.
El atleta elige categoría y acepta las condiciones para preinscribirse gratis.
La preinscripción crea `competition_open_entries` en estado `preregistered`,
con `registered_at` y sin `paid_at`, visible al organizador y en Mis eventos.
No genera ingresos ni reserva cupo final. Puede pagar más adelante hasta el
cierre de entregas, incluso si ya cerró la ventana de nuevas inscripciones.
El pago aprobado actualiza la misma entrada a `paid` y conserva la fecha de registro.
Los intentos fallidos conservan la preinscripción sin marcarla pagada.
La fecha opcional `submissions_open_at` bloquea archivos y enlaces antes de la apertura;
sin fecha se conserva la entrega inmediata después del pago. Los datos pueden
editarse hasta la fecha límite o hasta que el organizador revise la entrega.
Una entrega ausente se muestra como `missing` al vencer el plazo, sin alterar
el pago ni iniciar reembolsos.

El organizador clasifica o rechaza entregas recibidas. Al clasificar se reserva
el cupo de la categoría; `CompetitionParticipant` se crea únicamente al
aprobar el segundo pago o inmediatamente si el monto adicional es cero.
Las decisiones revisadas quedan bloqueadas y conservan autor y fecha.

Con precio por confirmar, `final_amount` permanece nulo: se puede pagar y
entregar el Open, pero clasificar no confirma un cupo gratuito ni habilita un
cobro final. El organizador publica una vez los importes adicionales de todas
las categorías en `/open/final-prices`; quedan registrados autor y fecha.
Los atletas aceptan ese valor al iniciar el pago final. La publicación actualiza
las entradas pendientes y los pagos del Open aprobados después también toman
ese precio, sin reescribir el snapshot del intento original. Publicar cero
confirma explícitamente sin cobro adicional a los atletas ya clasificados.

Los intentos `open` y `open_final` conservan ambos movimientos. Finanzas suma
el Open desde los intentos y el pago final desde la inscripción confirmada,
sin duplicar cobros. Las notificaciones repetidas no retroceden un pago aprobado.

## Stage

`stage_test=true` en `/api/competitions/:id/open/checkout` simula aprobación
solo si `APP_ENV` es `stage` o `staging`. La interfaz lo identifica como prueba;
Bold real permanece deshabilitado en stage. En producción la misma ruta
prepara el checkout de Bold y espera su webhook verificado.

Migraciones: `0042_open_qualifier` y `0044_open_preregistration`. Esta última
permite `paid_at` nulo y conserva la fecha de las entradas existentes en `registered_at`.
Pruebas: `python -m unittest discover -s server/tests -q` con `PYTHONPATH=server`
y una `DATABASE_URL` PostgreSQL de prueba para importar el módulo de conexión.
Los casos del Open usan una base SQLite aislada; nunca conectan a esa URL.
