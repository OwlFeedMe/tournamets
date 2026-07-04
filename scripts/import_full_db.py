import argparse
import gzip
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import MetaData, create_engine, select
from sqlalchemy.dialects.postgresql import insert


def backup_local(conn, metadata, backup_path):
    backup = {"created_at": datetime.now(timezone.utc).isoformat(), "tables": {}}
    for table in metadata.sorted_tables:
        backup["tables"][table.name] = [dict(row) for row in conn.execute(select(table)).mappings()]
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(backup_path, "wt", encoding="utf-8") as fh:
        json.dump(backup, fh, default=str, ensure_ascii=False)


def reset_sequences(conn, metadata):
    for table in metadata.sorted_tables:
        if len(table.primary_key.columns) != 1:
            continue
        pk_column = next(iter(table.primary_key.columns))
        try:
            is_int = pk_column.type.python_type is int
        except NotImplementedError:
            is_int = False
        if not is_int:
            continue
        conn.exec_driver_sql(
            "SELECT setval(pg_get_serial_sequence(%s, %s), GREATEST((SELECT COALESCE(MAX(%s), 1) FROM %s), 1), true)"
            % (repr(table.name), repr(pk_column.name), pk_column.name, table.name)
        )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--env-file", default="server/.env")
    parser.add_argument("--backup", default="")
    args = parser.parse_args()

    load_dotenv(args.env_file)
    engine = create_engine(os.environ["DATABASE_URL"])
    metadata = MetaData()
    metadata.reflect(engine)

    with gzip.open(args.input, "rt", encoding="utf-8") as fh:
        payload = json.load(fh)

    imported = {}
    with engine.begin() as conn:
        if args.backup:
            backup_local(conn, metadata, Path(args.backup))

        conn.exec_driver_sql("SET session_replication_role = replica")
        try:
            for table in reversed(metadata.sorted_tables):
                conn.execute(table.delete())

            for table in metadata.sorted_tables:
                rows = payload["tables"].get(table.name, [])
                if not rows:
                    imported[table.name] = 0
                    continue
                columns = {column.name for column in table.columns}
                clean_rows = [{key: value for key, value in row.items() if key in columns} for row in rows]
                conn.execute(insert(table).values(clean_rows))
                imported[table.name] = len(clean_rows)
        finally:
            conn.exec_driver_sql("SET session_replication_role = DEFAULT")

        reset_sequences(conn, metadata)

    print(json.dumps({"imported": imported, "backup": args.backup}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
