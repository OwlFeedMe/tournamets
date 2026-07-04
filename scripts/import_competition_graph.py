import argparse
import json
import os
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import MetaData, create_engine, select
from sqlalchemy.dialects.postgresql import insert


def pk_values(table, row):
    return tuple(row[column.name] for column in table.primary_key.columns)


def key_filter(table, keys):
    pk_columns = list(table.primary_key.columns)
    if len(pk_columns) == 1:
        return pk_columns[0].in_([key[0] for key in keys])
    from sqlalchemy import tuple_

    return tuple_(*pk_columns).in_(list(keys))


def backup_existing(conn, metadata, payload, backup_path):
    backup = {"created_at": datetime.utcnow().isoformat() + "Z", "tables": {}}
    for table_name, rows in payload["tables"].items():
        table = metadata.tables.get(table_name)
        if table is None or not rows:
            continue
        keys = [pk_values(table, row) for row in rows]
        existing = conn.execute(select(table).where(key_filter(table, keys))).mappings().all()
        if existing:
            backup["tables"][table_name] = [dict(row) for row in existing]
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    backup_path.write_text(json.dumps(backup, default=str, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--env-file", default="server/.env")
    parser.add_argument("--backup", default="")
    parser.add_argument("--replace-competition-id", type=int, default=0)
    args = parser.parse_args()

    load_dotenv(args.env_file)
    database_url = os.environ["DATABASE_URL"]
    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    engine = create_engine(database_url)
    metadata = MetaData()
    metadata.reflect(engine)

    imported = {}
    with engine.begin() as conn:
        if args.backup:
            backup_existing(conn, metadata, payload, Path(args.backup))

        conn.exec_driver_sql("SET session_replication_role = replica")
        try:
            if args.replace_competition_id:
                for table_name in reversed(list(payload["tables"].keys())):
                    table = metadata.tables.get(table_name)
                    if table is None or table_name == "competitions" or "competition_id" not in table.c:
                        continue
                    conn.execute(
                        table.delete().where(table.c.competition_id == args.replace_competition_id)
                    )

            if "participants" in payload["tables"] and "participants" in metadata.tables:
                participants = metadata.tables["participants"]
                incoming_ids = [row["id"] for row in payload["tables"]["participants"] if row.get("id") is not None]
                incoming_cedulas = [row["cedula"] for row in payload["tables"]["participants"] if row.get("cedula")]
                if incoming_cedulas:
                    conn.execute(
                        participants.delete().where(
                            (participants.c.cedula.in_(incoming_cedulas))
                            | (participants.c.id.in_(incoming_ids)),
                        )
                    )

            for table_name, rows in payload["tables"].items():
                table = metadata.tables.get(table_name)
                if table is None or not rows:
                    continue
                pk_names = [column.name for column in table.primary_key.columns]
                columns = {column.name for column in table.columns}
                clean_rows = [
                    {key: value for key, value in row.items() if key in columns}
                    for row in rows
                ]
                stmt = insert(table).values(clean_rows)
                update_columns = {
                    column.name: getattr(stmt.excluded, column.name)
                    for column in table.columns
                    if column.name not in pk_names
                }
                if update_columns:
                    stmt = stmt.on_conflict_do_update(index_elements=pk_names, set_=update_columns)
                else:
                    stmt = stmt.on_conflict_do_nothing(index_elements=pk_names)
                conn.execute(stmt)
                imported[table_name] = len(clean_rows)
        finally:
            conn.exec_driver_sql("SET session_replication_role = DEFAULT")

        for table_name, rows in payload["tables"].items():
            table = metadata.tables.get(table_name)
            if table is None or not rows or len(table.primary_key.columns) != 1:
                continue
            pk_column = next(iter(table.primary_key.columns))
            if not getattr(pk_column.type, "python_type", None) is int:
                continue
            conn.exec_driver_sql(
                "SELECT setval(pg_get_serial_sequence(%s, %s), GREATEST((SELECT COALESCE(MAX(%s), 1) FROM %s), 1), true)"
                % (
                    repr(table_name),
                    repr(pk_column.name),
                    pk_column.name,
                    table_name,
                )
            )

    print(json.dumps({"imported": imported, "backup": args.backup}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
