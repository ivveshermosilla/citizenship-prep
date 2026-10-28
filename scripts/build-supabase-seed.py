#!/usr/bin/env python3
"""Build reproducible SQL and a manifest from the verified local answer catalog.

This does not connect to Supabase, retrieve credentials, or advance factual
verification dates. Rebuild only after reviewing/updating the source catalog.
"""

from pathlib import Path
from datetime import date
from collections import Counter
import calendar
import csv
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'research/2026-10-27/answers'
OUTPUT = ROOT / 'supabase'
COLUMNS = [
    'question_number', 'source_question_id', 'question_text', 'section',
    'subsection', 'language', 'special_consideration_65_20', 'geographic_scope',
    'geography', 'state_code', 'district_code', 'answers', 'answer_display',
    'answer_status', 'previous_officeholder', 'temporal_class',
    'is_time_dependent', 'answer_updated_on', 'regular_transition_on',
    'source_urls', 'source_details', 'notes',
    'expected_change_on', 'expected_change_through', 'change_expectation',
    'change_guidance',
]


def next_month(value):
    d = date.fromisoformat(value)
    year, month = d.year + (d.month == 12), d.month % 12 + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1])).isoformat()


def insert_sql(table, rows):
    if table not in {'civics_questions_2008', 'civics_questions_2025'}:
        raise ValueError('Unexpected table')
    literal = json.dumps(rows, ensure_ascii=False, separators=(',', ':')).replace("'", "''")
    columns = ', '.join(COLUMNS)
    selected = ', '.join('x.' + column for column in COLUMNS)
    assignments = ',\n  '.join(f'{column} = excluded.{column}' for column in COLUMNS if column not in {'question_number', 'geography'})
    return f"""insert into public.{table} ({columns})
select {selected}
from jsonb_populate_recordset(null::public.{table}, '{literal}'::jsonb) as x
on conflict (question_number, geography) do update set
  {assignments};
"""


def build():
    guide_file = CATALOG / 'change-guidance.json'
    guides = {(x['edition'], x['question_number'], x['geography']): x
              for x in json.loads(guide_file.read_text())['records']}
    sources = json.loads((CATALOG / 'sources.json').read_text())['sources']
    by_url = {source['url']: source for source in sources}
    questions = {}
    for edition in ['2008', '2025']:
        bank = json.loads((CATALOG / f'answers-{edition}.json').read_text())
        questions.update({question['id']: question for question in bank['questions']})
    with (CATALOG / 'resolved-answers.csv').open(newline='') as stream:
        flat = list(csv.DictReader(stream))
    rows = {'2008': [], '2025': []}
    for source in flat:
        q = questions[source['question_id']]
        edition = source['edition_id'].removeprefix('uscis-')
        state = source['jurisdiction_code'] or None
        district = source['district_id'] or None
        scope = q['geographic_scope']
        geography = 'US' if not state else f'US-{state}' + (f'-{district[2:]}' if district else '')
        options = json.loads(source['answer_options'])
        previous = source['previous_officeholder'] or None
        if source['status'] == 'vacant':
            assert options == ['Vacant'] and previous
            assert source['answer_display'] == f'Vacant (previously: {previous})'
        urls = json.loads(source['source_urls'])
        row = {
            'question_number': q['official_number'],
            'source_question_id': q['id'], 'question_text': q['question_text'],
            'section': q['section'], 'subsection': q['subsection'],
            'language': q['language'],
            'special_consideration_65_20': q['special_consideration_65_20'],
            'geographic_scope': scope, 'geography': geography,
            'state_code': state, 'district_code': district,
            'answers': options, 'answer_display': source['answer_display'],
            'answer_status': source['status'], 'previous_officeholder': previous,
            'temporal_class': q['temporal_class'],
            'is_time_dependent': q['volatility'] in {'medium', 'high'},
            'answer_updated_on': source['data_updated_on'],
            'regular_transition_on': source['regular_transition_on'] or None,
            'source_urls': urls,
            'source_details': [by_url[url] for url in dict.fromkeys(urls)],
            'notes': source['notes'] or None,
        }
        guide = guides[(edition, q['official_number'], geography)]
        row.update({column: guide[column] for column in
                    ['expected_change_on', 'expected_change_through',
                     'change_expectation', 'change_guidance']})
        assert source['data_updated_on'] == source['verified_on']
        assert source['suggested_update_on'] == next_month(row['answer_updated_on'])
        rows[edition].append(row)
    assert {key: len(value) for key, value in rows.items()} == {'2008': 705, '2025': 733}
    for edition, entries in rows.items():
        entries.sort(key=lambda row: (row['question_number'], row['geography']))
        assert len({(row['question_number'], row['geography']) for row in entries}) == len(entries)
        assert len({row['question_number'] for row in entries}) == (100 if edition == '2008' else 128)
    OUTPUT.mkdir(exist_ok=True)
    sql = '-- Generated from verified local catalogs. No credentials are required to build this file.\n'
    sql += '-- Does not advance source-verification dates. Monthly review policy is enforced by the schema.\n'
    sql += 'begin;\n'
    for edition, entries in rows.items():
        sql += insert_sql('civics_questions_' + edition, entries)
    sql += 'commit;\n'
    (OUTPUT / 'seed.sql').write_text(sql)
    manifest = {
        'source_catalog': 'research/2026-10-27/answers/resolved-answers.csv',
        'change_guidance_catalog': 'research/2026-10-27/answers/change-guidance.json',
        'change_guidance_sha256': hashlib.sha256(guide_file.read_bytes()).hexdigest(),
        'source_sha256': hashlib.sha256((CATALOG / 'resolved-answers.csv').read_bytes()).hexdigest(),
        'seed_sha256': hashlib.sha256(sql.encode()).hexdigest(),
        'answer_updated_on': sorted({row['answer_updated_on'] for values in rows.values() for row in values}),
        'update_interval_calendar_months': 1,
        'next_update_on': sorted({next_month(row['answer_updated_on']) for values in rows.values() for row in values}),
        'tables': {f'civics_questions_{edition}': {'rows': len(entries), 'distinct_questions': len({row['question_number'] for row in entries}), 'geography_counts': dict(Counter(row['geographic_scope'] for row in entries))} for edition, entries in rows.items()},
    }
    (OUTPUT / 'seed-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    return rows, manifest


if __name__ == '__main__':
    _, result = build()
    print(json.dumps(result, ensure_ascii=False, indent=2))
