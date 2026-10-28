#!/usr/bin/env python3
"""Build internal change expectations without changing verified answers or dates."""
import calendar
import csv
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'research/2026-10-27/answers'
CHECKED = '2026-10-27'
CONSTITUTION = 'https://www.archives.gov/founding-docs/amendments-11-27'
NGA = 'https://www.nga.org/governors/elections/'
SENATE = 'https://www.senate.gov/senators/Class_II.htm'
APPOINTMENTS = 'https://www.senate.gov/senators/AppointedSenators.htm'
OHIO = 'https://www.ohiosos.gov/globalassets/elections/directives/2025/directive-2025-54---writ-of-special-election-for-united-states-senate-election.pdf'
FLORIDA = 'https://files.floridados.gov/media/710256/2026_nge_des_english.pdf'


def guidance(start=None, end=None, kind='unscheduled', basis='', urls=(), candidates=()):
    return {
        'expected_change_on': start,
        'expected_change_through': end,
        'change_expectation': kind,
        'change_guidance': {
            'assessed_on': CHECKED, 'basis': basis, 'source_urls': list(urls),
            'answer_candidates': list(candidates),
            'guaranteed_expiration': False,
            'early_change_possible': kind != 'not_applicable',
            'internal_only': True,
        },
    }


def build():
    senators = json.loads((DATA / 'senators.json').read_text())['senators']
    jurisdictions = json.loads((DATA / 'jurisdictions.json').read_text())['jurisdictions']
    questions = {edition: {q['official_number']: q for q in
                 json.loads((DATA / f'answers-{edition}.json').read_text())['questions']}
                 for edition in ['2008', '2025']}
    by_state = {s: [x for x in senators if x['state_code'] == s] for s in {x['state_code'] for x in senators}}
    # NGA election histories + regular four-year terms; NH/VT have two-year terms.
    # Month-only estimates are editorial extrapolations, not announced inaugurations.
    offcycle = {**dict.fromkeys(['KY', 'LA', 'MS'], 2027),
                **dict.fromkeys(['DE', 'IN', 'MO', 'MT', 'NC', 'ND', 'UT', 'WA', 'WV', 'AS', 'PR'], 2028),
                **dict.fromkeys(['NJ', 'VA'], 2029)}
    governor = {}
    for j in jurisdictions:
        state = j['id']
        if state == 'DC':
            governor[state] = guidance(kind='not_applicable', basis='D.C. has no governor; this is not a vacant office.', urls=[NGA])
            continue
        year = offcycle.get(state, 2026)
        month, term_year = (12, year) if state in {'AK', 'HI', 'KY', 'ND'} else (1, year + 1)
        start = f'{term_year}-{month:02d}-01'
        end = f'{term_year}-{month:02d}-{calendar.monthrange(term_year, month)[1]:02d}'
        urls = [NGA]
        kind = 'estimated_window'
        basis = f'Editorial month estimate for the regular transition following the {year} gubernatorial election cycle, extrapolated from NGA election/term history. Not an officially announced inauguration day; reelection may preserve the answer, succession may change it earlier.'
        if state in {'AK', 'HI'}:
            start = end = '2026-12-07'
            kind = 'regular_cycle'
            urls += ['https://www.elections.alaska.gov/calendar/' if state == 'AK' else 'https://elections.hawaii.gov/resources/elected-officials/']
            basis = 'Regular four-year term boundary: first Monday in December after the 2026 election. Constitutional/calendar checkpoint, not guaranteed incumbent replacement.'
        governor[state] = guidance(start, end, kind, basis, urls)
    assert Counter(offcycle.values()) == {2027: 3, 2028: 11, 2029: 2}
    result = []
    with (DATA / 'resolved-answers.csv').open(newline='') as stream:
        for row in csv.DictReader(stream):
            edition = row['edition_id'].removeprefix('uscis-')
            number = int(row['official_number'])
            state, district = row['jurisdiction_code'], row['district_id']
            geography = 'US' if not state else f'US-{state}' + (f'-{district[2:]}' if district else '')
            q = questions[edition][number]
            if number == (20 if edition == '2008' else 23):
                candidates = []
                for senator in by_state.get(state, []):
                    start = end = senator['regular_seat_term_end_on']
                    urls = [SENATE, CONSTITUTION]
                    kind = 'regular_cycle'
                    if state in {'OH', 'FL'} and senator['appointed_incumbent']:
                        start, end, kind = '2026-11-03', '2027-01-03', 'estimated_window'
                        urls += [OHIO if state == 'OH' else FLORIDA, APPOINTMENTS]
                    candidates.append({'answer': senator['name'], 'senate_class': senator['senate_class'],
                                       'regular_seat_term_end_on': senator['regular_seat_term_end_on'],
                                       'expected_change_on': start, 'expected_change_through': end,
                                       'expectation': kind, 'source_urls': urls})
                if candidates:
                    earliest = min(x['expected_change_on'] for x in candidates)
                    end = max(x['expected_change_through'] for x in candidates if x['expected_change_on'] == earliest)
                    g = guidance(earliest, end, 'estimated_window' if end != earliest else 'regular_cycle',
                                 'Earliest checkpoint among valid senator names; each name retains its own seat cycle below. OH/FL special-election windows are editorial: certification, oath or reelection determine actual succession; the window is not a legal deadline. Unscheduled succession can occur earlier.',
                                 sorted({u for x in candidates for u in x['source_urls']}), candidates)
                else:
                    g = guidance(kind='not_applicable', basis='This jurisdiction has no U.S. senators; no officeholder term applies.', urls=[SENATE])
            elif number == (43 if edition == '2008' else 61):
                g = governor[state]
            elif district:
                day = row['regular_transition_on']
                g = guidance(day, day, 'regular_cycle',
                             'Regular seat-term boundary, not guaranteed incumbent replacement. Puerto Rico resident commissioner has a four-year term. A vacant seat can be filled earlier; no date for filling the current vacancy has been verified here.',
                             [CONSTITUTION] + json.loads(row['source_urls']))
            elif row['regular_transition_on']:
                day = row['regular_transition_on']
                g = guidance(day, day, 'regular_cycle',
                             'Regular constitutional term or new-Congress organization checkpoint. Reelection or a delayed Speaker election may preserve the same name; resignation, death, removal or another succession event can change it earlier.', [CONSTITUTION])
            elif q['temporal_class'] == 'calendar_sensitive':
                g = guidance('2027-01-01', '2027-01-01', 'annual_checkpoint',
                             'New calendar/tax year is a review checkpoint only. April 15 remains the USCIS study response; actual IRS deadlines and exceptions are separate. This is not a predicted change to the accepted answer.', json.loads(row['source_urls']))
            elif q['volatility'] in {'medium', 'high'}:
                g = guidance(basis='No scheduled replacement date established. Institutional/legal changes, judicial vacancies or appointments can occur without a regular renewal date; retain monthly source review.', urls=json.loads(row['source_urls']))
            else:
                g = guidance(kind='not_applicable', basis='No periodic answer-renewal date applies. Geographic dependence alone (for example, a capital) does not establish a service term. Exceptional legal or factual changes remain possible; retain monthly review.', urls=json.loads(row['source_urls']))
            result.append({'edition': edition, 'question_number': number, 'geography': geography, **g})
    assert len(result) == 1438
    assert len({(r['edition'], r['question_number'], r['geography']) for r in result}) == len(result)
    output = {'assessed_on': CHECKED, 'monthly_cadence_unchanged': True, 'records': result}
    (DATA / 'change-guidance.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'rows': len(result), 'expectations': dict(Counter(r['change_expectation'] for r in result))}))


if __name__ == '__main__':
    build()
