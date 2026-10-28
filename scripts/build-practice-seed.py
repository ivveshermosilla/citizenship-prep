#!/usr/bin/env python3
"""Build a draft-only SQL seed from the reviewed Quick Question catalog.

The source SHA-256 must be passed back explicitly as --root-approved-sha256.
This prevents accidental generation from a catalog that changed after review.
Generated SQL inserts only into the private learning catalog tables and keeps
the version/questions in draft status until a separate reviewed approval step.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "content/practice/catalog.json"
DEFAULT_OUTPUT = ROOT / "supabase/practice-seed.sql"
COUNTS = {"2008": 100, "2025": 128}


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def json_literal(value: Any) -> str:
    return sql_literal(json.dumps(value, ensure_ascii=False, separators=(",", ":"))) + "::jsonb"


def text_array(values: list[str]) -> str:
    if not values:
        return "ARRAY[]::text[]"
    return "ARRAY[" + ", ".join(sql_literal(value) for value in values) + "]::text[]"


def load_and_validate(path: Path) -> tuple[dict[str, Any], str]:
    raw = path.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    catalog = json.loads(raw)
    if not isinstance(catalog, dict) or set(catalog) != {"content_version", "editions"}:
        raise ValueError("catalog must contain exactly content_version and editions")
    version = catalog["content_version"]
    if not isinstance(version, str) or not re.fullmatch(r"[A-Za-z0-9._-]{1,80}", version):
        raise ValueError("content_version must match [A-Za-z0-9._-]{1,80}")
    if set(catalog["editions"]) != set(COUNTS):
        raise ValueError("catalog must contain exactly editions 2008 and 2025")

    for edition, expected_count in COUNTS.items():
        rows = catalog["editions"][edition].get("questions")
        if not isinstance(rows, list) or len(rows) != expected_count:
            raise ValueError(f"{edition} edition must have exactly {expected_count} questions")
        for expected_q, row in enumerate(rows, 1):
            prefix = f"{edition} Q{expected_q}"
            if not isinstance(row, dict) or row.get("question_number") != expected_q:
                raise ValueError(f"{prefix}: question numbers must be complete and ordered")
            required = row.get("required_count")
            groups, sets = row.get("answer_groups"), row.get("distractor_sets")
            strategy = row.get("strategy")
            if not isinstance(required, int) or not 1 <= required <= 8:
                raise ValueError(f"{prefix}: invalid required_count")
            if not isinstance(groups, list) or not isinstance(sets, list) or len(sets) < 3:
                raise ValueError(f"{prefix}: answer_groups/distractor_sets are incomplete")
            if any(not isinstance(option_set, list) or len(option_set) != required
                   or any(not isinstance(option, str) or not option.strip() for option in option_set)
                   for option_set in sets):
                raise ValueError(f"{prefix}: distractor sets must be complete nonempty string arrays")
            if not isinstance(strategy, dict) or set(strategy) != {"answer_groups", "distractors", "current_aliases"}:
                raise ValueError(f"{prefix}: strategy keys are invalid")
            answer_mode = strategy["answer_groups"]
            aliases = strategy["current_aliases"]
            if answer_mode not in ("catalog", "current_answer"):
                raise ValueError(f"{prefix}: invalid answer_groups strategy")
            if strategy["distractors"] not in ("curated", "other_geographies"):
                raise ValueError(f"{prefix}: invalid distractors strategy")
            if answer_mode == "current_answer":
                if groups or row.get("reference_answers") != [] or aliases not in (
                    "official_variants_only", "person_name", "political_party"
                ):
                    raise ValueError(f"{prefix}: current_answer rows need empty groups/references and a dynamic alias strategy")
            else:
                if not groups or not row.get("reference_answers") or aliases != "catalog":
                    raise ValueError(f"{prefix}: catalog rows need reviewed groups/references and catalog aliases")
                if len(groups) < required:
                    raise ValueError(f"{prefix}: fewer answer groups than required_count")
                for group in groups:
                    if not isinstance(group, dict) or set(group) != {"key", "display", "aliases"}:
                        raise ValueError(f"{prefix}: malformed answer group")
                    if not all(isinstance(group[k], str) and group[k].strip() for k in ("key", "display")):
                        raise ValueError(f"{prefix}: answer group key/display cannot be empty")
                    if not isinstance(group["aliases"], list) or any(not isinstance(x, str) or not x.strip() for x in group["aliases"]):
                        raise ValueError(f"{prefix}: answer group aliases must be nonempty strings")
            if not isinstance(row.get("reference_answers"), list) or any(not isinstance(x, str) for x in row["reference_answers"]):
                raise ValueError(f"{prefix}: reference_answers must be a string array")
            if not isinstance(row.get("rationale"), str) or not row["rationale"].strip():
                raise ValueError(f"{prefix}: rationale is required")
            urls = row.get("source_urls")
            if not isinstance(urls, list) or not urls or any(not isinstance(url, str) or not url.startswith("https://") for url in urls):
                raise ValueError(f"{prefix}: source_urls must be a nonempty HTTPS string array")
            if row.get("review_status") not in ("draft", "approved"):
                raise ValueError(f"{prefix}: unsupported review_status")
    return catalog, sha


def build_sql(catalog: dict[str, Any], sha: str) -> str:
    version = catalog["content_version"]
    review_summary = f"Draft catalog seed; SHA-256 {sha}; 100 questions (2008), 128 questions (2025)."
    lines = [
        "-- Generated by scripts/build-practice-seed.py; do not edit by hand.",
        f"-- Catalog SHA-256: {sha}",
        f"-- Content version: {version}",
        "-- Manifest: edition counts 2008=100, 2025=128, total=228.",
        "-- The explicit --root-approved-sha256 argument is required to generate this file.",
        "begin;",
        "insert into game_private.learning_content_versions(content_version, status, review_summary)",
        f"values ({sql_literal(version)}, 'draft', {sql_literal(review_summary)})",
        "on conflict (content_version) do update set review_summary = excluded.review_summary",
        "where game_private.learning_content_versions.status = 'draft';",
        "do $$ begin",
        f"  if not exists (select 1 from game_private.learning_content_versions where content_version = {sql_literal(version)} and status = 'draft') then",
        "    raise exception 'content version is already approved or retired; refusing seed update';",
        "  end if;",
        "end $$;",
        "insert into game_private.practice_question_metadata(",
        "  content_version, edition, question_number, required_count, reference_answers, answer_groups,",
        "  distractor_sets, strategy, rationale, source_urls, review_status",
        ") values",
    ]
    values: list[str] = []
    for edition in ("2008", "2025"):
        for row in catalog["editions"][edition]["questions"]:
            values.append("  (" + ", ".join([
                sql_literal(version),
                sql_literal(edition),
                str(row["question_number"]),
                str(row["required_count"]),
                text_array(row["reference_answers"]),
                json_literal(row["answer_groups"]),
                json_literal(row["distractor_sets"]),
                json_literal(row["strategy"]),
                sql_literal(row["rationale"]),
                text_array(row["source_urls"]),
                "'draft'",
            ]) + ")")
    lines.append(",\n".join(values))
    lines.extend([
        "on conflict (content_version, edition, question_number) do update set",
        "  required_count = excluded.required_count, reference_answers = excluded.reference_answers,",
        "  answer_groups = excluded.answer_groups, distractor_sets = excluded.distractor_sets,",
        "  strategy = excluded.strategy, rationale = excluded.rationale, source_urls = excluded.source_urls,",
        "  review_status = 'draft'",
        "where game_private.practice_question_metadata.review_status = 'draft';",
        "do $$",
        "declare n_2008 integer; n_2025 integer;",
        "begin",
        f"  select count(*) filter (where edition = '2008' and review_status = 'draft'), count(*) filter (where edition = '2025' and review_status = 'draft') into n_2008, n_2025",
        f"    from game_private.practice_question_metadata where content_version = {sql_literal(version)};",
        "  if n_2008 <> 100 or n_2025 <> 128 then",
        "    raise exception 'seed manifest mismatch: 2008 %, 2025 %', n_2008, n_2025;",
        "  end if;",
        "end $$;",
        "commit;",
        "",
    ])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--root-approved-sha256", required=True,
        help="Explicit root approval of the exact source catalog bytes; must equal the computed SHA-256.",
    )
    args = parser.parse_args()
    catalog, sha = load_and_validate(args.source)
    if not re.fullmatch(r"[0-9a-f]{64}", args.root_approved_sha256) or args.root_approved_sha256 != sha:
        raise SystemExit(f"approval SHA mismatch: catalog SHA-256 is {sha}")
    sql = build_sql(catalog, sha)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(sql, encoding="utf-8")
    print(f"Generated draft-only seed: {args.output}")
    print(f"Catalog SHA-256: {sha}; 2008=100; 2025=128; total=228")


if __name__ == "__main__":
    main()
