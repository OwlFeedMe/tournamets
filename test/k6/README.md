# k6 Smoke Load Tests

Estos scripts no buscan tumbar el servicio. Sirven para validar rapido si un deploy aguanta carga basica creible y para detectar el siguiente cuello de botella.

## Requisitos

- Tener `k6` instalado
- Usar una competencia real o de prueba con `COMPETITION_ID`
- Correr idealmente en una ventana de bajo trafico

## Variables

- `BASE_URL`: URL base, por ejemplo `https://finalrep.co`
- `COMPETITION_ID`: ID de la competencia a consultar
- `INCLUDE_TIMER`: `1` para incluir trafico de timer en el escenario mixto
- `LEADERBOARD_SLEEP_SECONDS`: intervalo entre consultas de leaderboard, default `5`
- `PUBLIC_SLEEP_SECONDS`: intervalo entre consultas de public endpoint, default `20`
- `TIMER_SLEEP_SECONDS`: intervalo entre consultas de timer, default `30`
- `REQUEST_TIMEOUT`: timeout por request, default `10s`

## Escenarios

### Leaderboard puro

Sube en escalones de `20 -> 50 -> 100` usuarios virtuales, con pausas tipo espectador.

```bash
k6 run -e BASE_URL=https://finalrep.co -e COMPETITION_ID=6 test/k6/leaderboard-smoke.js
```

### Trafico mixto

Combina:

- viewers del leaderboard
- viewers de la pagina publica
- viewers del timer opcional

Sin timer:

```bash
k6 run -e BASE_URL=https://finalrep.co -e COMPETITION_ID=6 test/k6/mixed-smoke.js
```

Con timer:

```bash
k6 run -e BASE_URL=https://finalrep.co -e COMPETITION_ID=6 -e INCLUDE_TIMER=1 test/k6/mixed-smoke.js
```

## Como leer el resultado

Pasa si se mantiene aproximadamente en estos rangos:

- `http_req_failed < 1%`
- `checks > 99%`
- `leaderboard p95 < 750ms`
- `leaderboard p99 < 1500ms`

Si falla:

- errores altos: revisar backend, Redis, timeouts o limite de conexiones a DB
- p95 alto solo en leaderboard: revisar invalidadciones o misses de cache
- p95 alto en timer: revisar si el timer esta consultando DB demasiado seguido
- p95 alto en `/public`: revisar queries no cacheadas en endpoints publicos

## Recomendacion operativa

Corre primero `leaderboard-smoke.js`. Si sale limpio, corre `mixed-smoke.js`. Si ambos salen bien, ya tienes una validacion minima de capacidad para un deploy sin hacer un stress test completo.
