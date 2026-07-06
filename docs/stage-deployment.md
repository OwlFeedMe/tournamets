# FinalRep stage deployment

Stage runs on the same server as production, but uses separate code, containers,
ports, Redis volume, environment file and PostgreSQL schema.

## Layout

- Production path: `/opt/finalrep`
- Stage path: `/opt/finalrep-stage`
- Production domain: `finalrep.co`
- Stage domain: `stage.finalrep.co`
- Production branch: `main`
- Stage branch: `staging`
- Production port: `APP_PORT=8081`
- Stage port: `APP_PORT=127.0.0.1:8083`

## Stage environment

Create `/opt/finalrep-stage/server/.env.stage` from the production env and change:

```env
APP_ENV=stage
ENVIRONMENT=stage
DATABASE_URL=postgresql+psycopg2://USER:PASSWORD@HOST:5432/defaultdb?sslmode=require&options=-csearch_path%3Dfinalrep_stage%2Cpublic
APP_PORT=127.0.0.1:8083
CORS_ALLOWED_ORIGINS=https://stage.finalrep.co
LEADERBOARD_BASE_URL=https://stage.finalrep.co/
STAGE_EMAIL_GUARD_ENABLED=1
ADMIN_NOTIFICATION_EMAIL=admin@finalrep.co
STAGE_EMAIL_ALLOWED_EMAILS=admin@finalrep.co
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:support@finalrep.co
```

Keep Brevo configured in stage if email delivery must be tested.

## Email behavior in stage

When `APP_ENV=stage` or `ENVIRONMENT=stage`:

- Subjects are prefixed with `[PRUEBA STAGE]`.
- Email is delivered only to active users with admin or organizer access.
- Emails listed in `ADMIN_NOTIFICATION_EMAIL` or `STAGE_EMAIL_ALLOWED_EMAILS`
  are always allowed.
- Other user emails are blocked and logged.

## Caddy

Point `stage.finalrep.co` to the stage frontend port:

```caddyfile
stage.finalrep.co {
    reverse_proxy 127.0.0.1:8083
}
```

Production keeps pointing to the production port.

## Auto deploy

Install the stage timer:

```bash
cp /opt/finalrep-stage/ops/finalrep-stage-autodeploy.service /etc/systemd/system/
cp /opt/finalrep-stage/ops/finalrep-stage-autodeploy.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now finalrep-stage-autodeploy.timer
```

`deploy.auto.sh` will pull `staging` in `/opt/finalrep-stage` and run
`deploy.stage.sh`.

## Manual database refresh

Stage is not refreshed automatically. Run it only when needed. The default
copies production schema `public` into stage schema `finalrep_stage`:

```bash
cd /opt/finalrep-stage
PROD_DATABASE_URL='postgresql+psycopg2://USER:PASSWORD@HOST:5432/defaultdb?sslmode=require' \
STAGE_DATABASE_URL='postgresql+psycopg2://USER:PASSWORD@HOST:5432/defaultdb?sslmode=require' \
PROD_SCHEMA=public \
STAGE_SCHEMA=finalrep_stage \
PGCLIENT_DOCKER_IMAGE=postgres:18-alpine \
ops/refresh-stage-db.sh
```

The script asks for `REFRESH_STAGE` before replacing the stage schema.
