# Open clasificatorio

En el panel del organizador: competencia → Inscripciones → Open clasificatorio.
Configurar antes de recibir inscripciones o iniciar pagos. Disponible para
categorías individuales; la inscripción de equipos requiere definir primero
si la entrega y la clasificación serán por atleta o por equipo.

- Precio del Open obligatorio, mayor a cero.
- Fecha límite en la zona horaria de la competencia, instrucciones y campos
  de texto/número. Video por enlace HTTP(S) o archivo MP4/MOV/WebM hasta 100 MB.
- Pago final: precio completo de la categoría, diferencia sin incluir servicio,
  porcentaje de descuento o sin pago adicional. Se aplica el servicio habitual
  a cada cobro mayor a cero.
- Las condiciones se congelan cuando se inicia el primer pago. Cada pago
  inicial conserva precio final, reglas, términos y aceptación en su snapshot.

El atleta entra por `/competitions/:id/open`, también desde la inscripción
normal o desde Mis eventos. Un intento de pago no crea una participación.
Solo un pago aprobado crea `competition_open_entries`. Los datos pueden
editarse hasta la fecha límite o hasta que el organizador revise la entrega.
Una entrega ausente se muestra como `missing` al vencer el plazo, sin alterar
el pago ni iniciar reembolsos.

El organizador clasifica o rechaza entregas recibidas. Al clasificar se reserva
el cupo de la categoría; `CompetitionParticipant` se crea únicamente al
aprobar el segundo pago o inmediatamente si el monto adicional es cero.
Las decisiones revisadas quedan bloqueadas y conservan autor y fecha.

Los intentos `open` y `open_final` conservan ambos movimientos. Finanzas suma
el Open desde los intentos y el pago final desde la inscripción confirmada,
sin duplicar cobros. Las notificaciones repetidas no retroceden un pago aprobado.

## Stage

`stage_test=true` en `/api/competitions/:id/open/checkout` simula aprobación
solo si `APP_ENV` es `stage` o `staging`. La interfaz lo identifica como prueba;
Bold real permanece deshabilitado en stage. En producción la misma ruta
prepara el checkout de Bold y espera su webhook verificado.

Migración: `0042_open_qualifier`, aditiva y sin modificar inscripciones previas.
Pruebas: `python -m unittest discover -s server/tests -q` con `PYTHONPATH=server`
y una `DATABASE_URL` PostgreSQL de prueba para importar el módulo de conexión.
Los casos del Open usan una base SQLite aislada; nunca conectan a esa URL.
