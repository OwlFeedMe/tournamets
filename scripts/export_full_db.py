import argparse
import gzip
import json
import os
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import MetaData, create_engine, select


def json_default(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--env-file", default="server/.env")
    args = parser.parse_args()

    load_dotenv(args.env_file)
    engine = create_engine(os.environ["DATABASE_URL"])
    metadata = MetaData()
    metadata.reflect(engine)

    payload = {"tables": {}}
    counts = {}
    with engine.connect() as conn:
        for table in metadata.sorted_tables:
            rows = [dict(row) for row in conn.execute(select(table)).mappings()]
            payload["tables"][table.name] = rows
            counts[table.name] = len(rows)

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(output, "wt", encoding="utf-8") as fh:
        json.dump(payload, fh, default=json_default, ensure_ascii=False)

    print(json.dumps({"output": str(output), "counts": counts}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
