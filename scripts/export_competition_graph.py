import argparse
import json
import os
from collections import defaultdict, deque
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import MetaData, and_, create_engine, inspect, select, tuple_

PARTICIPANT_CHILD_ALLOWLIST = {
    "athlete_username_aliases",
}


def json_default(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def pk_tuple(table, row):
    return tuple(row[column.name] for column in table.primary_key.columns)


def key_filter(table, keys):
    pk_columns = list(table.primary_key.columns)
    if len(pk_columns) == 1:
        return pk_columns[0].in_([key[0] for key in keys])
    return tuple_(*pk_columns).in_(list(keys))


def fk_value_tuple(row, constrained_columns):
    values = tuple(row[column] for column in constrained_columns)
    if any(value is None for value in values):
        return None
    return values


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--competition-id", type=int, required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--env-file", default="server/.env")
    args = parser.parse_args()

    load_dotenv(args.env_file)
    database_url = os.environ["DATABASE_URL"]
    engine = create_engine(database_url)
    metadata = MetaData()
    metadata.reflect(engine)
    inspector = inspect(engine)

    tables = {table.name: table for table in metadata.sorted_tables if table.primary_key.columns}
    fk_children = defaultdict(list)
    fk_parents = defaultdict(list)

    for table_name in tables:
        for fk in inspector.get_foreign_keys(table_name):
            referred_table = fk.get("referred_table")
            if referred_table not in tables:
                continue
            item = {
                "child": table_name,
                "parent": referred_table,
                "constrained_columns": fk["constrained_columns"],
                "referred_columns": fk["referred_columns"],
            }
            fk_children[referred_table].append(item)
            fk_parents[table_name].append(item)

    selected = defaultdict(set)
    selected["competitions"].add((args.competition_id,))
    queue = deque([("competitions", (args.competition_id,))])
    rows_by_table = defaultdict(dict)

    with engine.connect() as conn:
        while queue:
            table_name, key = queue.popleft()
            table = tables.get(table_name)
            if table is None:
                continue
            if key not in rows_by_table[table_name]:
                row = conn.execute(select(table).where(key_filter(table, [key]))).mappings().first()
                if not row:
                    continue
                rows_by_table[table_name][key] = dict(row)

            row = rows_by_table[table_name][key]

            for fk in fk_parents[table_name]:
                parent_key = fk_value_tuple(row, fk["constrained_columns"])
                if parent_key and parent_key not in selected[fk["parent"]]:
                    selected[fk["parent"]].add(parent_key)
                    queue.append((fk["parent"], parent_key))

            for fk in fk_children[table_name]:
                if table_name == "participants" and fk["child"] not in PARTICIPANT_CHILD_ALLOWLIST:
                    continue
                child_table = tables[fk["child"]]
                clauses = [
                    child_table.c[child_col] == row[parent_col]
                    for child_col, parent_col in zip(fk["constrained_columns"], fk["referred_columns"])
                ]
                for child_row in conn.execute(select(child_table).where(and_(*clauses))).mappings():
                    child_key = pk_tuple(child_table, child_row)
                    if child_key not in selected[fk["child"]]:
                        selected[fk["child"]].add(child_key)
                        rows_by_table[fk["child"]][child_key] = dict(child_row)
                        queue.append((fk["child"], child_key))

    payload = {
        "competition_id": args.competition_id,
        "tables": {
            table_name: list(rows_by_table[table_name].values())
            for table_name in sorted(rows_by_table)
            if rows_by_table[table_name]
        },
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, default=json_default, ensure_ascii=False, indent=2), encoding="utf-8")
    counts = {table_name: len(rows) for table_name, rows in payload["tables"].items()}
    print(json.dumps({"output": str(output), "counts": counts}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
