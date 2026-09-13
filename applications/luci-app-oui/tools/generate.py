#!/usr/bin/env python3
"""Generate the offline subset from a local WH-2099/macdb checkout and Simple Icons 11.15.0.

No download or generation takes place on the router or during package builds.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]


def normalize(name):
    return re.sub(r'[^a-z0-9]+', ' ', name.lower()).strip()


def vendor_for(name, vendors):
    matches = [i for i, v in enumerate(vendors)
               if any(re.search(p, normalize(name)) for p in v['patterns'])]
    if len(matches) > 1:
        raise ValueError('Ambiguous vendor: ' + name)
    return matches[0] if matches else None


def generate(source, icons):
    vendors = json.loads((ROOT / 'tools/vendors.json').read_text())
    prefixes, all_rows, aliases = {}, {}, {}
    path = source / 'mac.csv'
    for row in csv.DictReader(path.open(encoding='utf-8-sig')):
        assignment = row['assignment'].upper()
        length = {'MA-L': 6, 'MA-M': 7, 'MA-S': 9}.get(row['registry'])
        if length is None or not re.fullmatch('[0-9A-F]{%d}' % length, assignment):
            raise ValueError('Invalid assignment: ' + assignment)
        index = vendor_for(row['org_name'], vendors)
        all_rows[assignment] = index
        if index is not None:
            prefixes[assignment] = index
            aliases.setdefault(vendors[index]['slug'], set()).add(row['org_name'])
    # An unrecognized more-specific assignment must mask a recognized parent.
    for assignment, index in all_rows.items():
        if index is None and any(assignment[:n] in prefixes for n in (6, 7) if n < len(assignment)):
            prefixes[assignment] = None
    out = ROOT / 'htdocs/luci-static/resources/oui'
    out.mkdir(parents=True, exist_ok=True)
    data = json.dumps({'vendors': [[v['slug'], v['name']] for v in vendors],
                       'prefixes': dict(sorted(prefixes.items()))}, separators=(',', ':')) + '\n'
    revision = hashlib.sha256(data.encode()).hexdigest()[:12]
    for old in out.glob('vendors-*.json'):
        old.unlink()
    (out / ('vendors-' + revision + '.json')).write_text(data)
    for v in vendors:
        if not v.get('supplemental'):
            shutil.copyfile(icons / 'icons' / (v['slug'] + '.svg'), out / (v['slug'] + '.svg'))
        elif not (out / (v['slug'] + '.svg')).is_file():
            raise ValueError('Missing supplemental icon: ' + v['slug'])
    shutil.copyfile(source / 'LICENSE', out / 'LICENSE.macdb')
    helper = out / 'oui.js'
    if helper.exists():
        helper.write_text(re.sub(r'vendors-[0-9a-f]+\.json', 'vendors-' + revision + '.json', helper.read_text()))
    for name in ['LICENSE.md', 'DISCLAIMER.md']:
        shutil.copyfile(icons / name, out / name)
    (ROOT / 'tools/sources.json').write_text(json.dumps({
        'simple_icons': 'https://github.com/simple-icons/simple-icons/tree/11.15.0',
        'macdb': {'url': 'https://github.com/WH-2099/macdb',
                  'sha256': hashlib.sha256(path.read_bytes()).hexdigest()},
        'database': 'vendors-' + revision + '.json',
        'assignments': len(prefixes),
        'supplemental_icons': json.loads((ROOT / 'tools/supplemental.json').read_text()),
        'aliases': {s: sorted(a) for s, a in sorted(aliases.items())}
    }, indent=2) + '\n')
    print(f'{len(vendors)} vendors, {len(prefixes)} assignments, {len(data)} bytes, revision {revision}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='macdb checkout containing mac.csv and LICENSE')
    parser.add_argument('icons', type=Path, help='Unpacked simple-icons 11.15.0 source')
    args = parser.parse_args()
    generate(args.source, args.icons)
