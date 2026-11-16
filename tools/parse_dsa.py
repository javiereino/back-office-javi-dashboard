#!/usr/bin/env python3
"""Convert an ICSC DSA circular (PDF) into per-diem/dsa-data.js.

Usage:  pdftotext -layout circular.pdf circular.txt
        python3 tools/parse_dsa.py circular.txt per-diem/dsa-data.js
"""
import json, re, sys

src, out = sys.argv[1], sys.argv[2]
lines = open(src, encoding="utf-8").read().splitlines()

ref = date = None
for l in lines:
    m = re.search(r"Reference:\s*(ICSC/CIRC/DSA/\d+)\s+(\d+)/(\w+)/(\d{4})", l)
    if m:
        ref = m.group(1)
        mon = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].index(m.group(3)[:3].lower()) + 1
        date = "%s-%02d-%02d" % (m.group(4), mon, int(m.group(2)))
        break

NUM = r"[\d,]+(?:\.\d+)?"
row = re.compile(r"^\s+(\S.*?)\s{2,}(%s)\s+(%s)\s+(%s)\s+(\d{1,3})\s+(\d\d/\d\d/\d\d)\s+(\d\d/\d\d/\d\d)\s*([\d,\s]*)$" % (NUM, NUM, NUM))
head = re.compile(r"^(\S.*?)\s*\(([^()]*(?:\([^()]*\))?[^()]*)\)\s*([\d,\s]*)$")
skip = re.compile(r"^(Note: Country|\s+International Civil Service|DSA Circular Report|\s+Room\s*$|\s+First 60|\s+Country - |\s+Days\s|\s+Area\s|\s+US\$|\s+DSA\s*$)")

def num(s):
    v = float(s.replace(",", ""))
    return int(v) if v == int(v) else v

countries, notes, unparsed = [], {}, []
cur, started, in_notes, last_note = None, False, False, None
for i, l in enumerate(lines):
    if not l.strip() or skip.match(l):
        continue
    if not started:
        if l.startswith("Afghanistan"):
            started = True
        else:
            continue
    if re.match(r"^\s*(Notes?|No\.?)\s+(Description|Explanation)", l) or re.match(r"^\s*NOTES\s*$", l):
        in_notes = True
        continue
    if not in_notes:
        m = row.match(l)
        if m and cur is not None:
            n = [int(x) for x in re.findall(r"\d+", m.group(8))]
            cur["areas"].append([m.group(1).strip(), num(m.group(2)), num(m.group(3)), num(m.group(4)), int(m.group(5)), n])
            continue
        m = head.match(l)
        if m and not l.startswith(" "):
            cur = {"country": m.group(1).strip(), "currency": m.group(2).strip(),
                   "notes": [int(x) for x in re.findall(r"\d+", m.group(3))], "areas": []}
            countries.append(cur)
            continue
        m = re.match(r"^\s{1,6}(\d{1,2})\s{2,}(\S.*)$", l)
        if m and len(countries) > 150:
            in_notes = True
        elif cur and cur["areas"] and re.match(r"^ \S", l) and not re.search(r"\d\d/\d\d/\d\d", l):
            a = cur["areas"][-1]  # wrapped area name continues on the next line
            a[0] = (a[0] + " " + l.strip()).replace("( ", "(")
            continue
        else:
            unparsed.append((i + 1, l))
            continue
    m = re.match(r"^\s{1,6}(\d{1,2})\s{2,}(\S.*)$", l)
    if m:
        last_note = int(m.group(1)); notes[last_note] = m.group(2).strip()
    elif last_note is not None:
        notes[last_note] += " " + l.strip()

data = {"ref": ref, "date": date, "countries": countries, "notes": notes}
open(out, "w", encoding="utf-8").write("window.DSA_DATA=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
print(ref, date, "countries:", len(countries), "areas:", sum(len(c["areas"]) for c in countries), "notes:", len(notes))
print("UNPARSED:", len(unparsed))
for u in unparsed[:60]:
    print(u)
