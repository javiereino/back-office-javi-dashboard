"""Writes samples/participants-sample.docx: headings per country followed by a table (fictional data)."""
import zipfile, pathlib
from xml.sax.saxutils import escape

out = pathlib.Path(__file__).resolve().parent.parent / "samples" / "participants-sample.docx"
groups = {
    "ITALIA": [("Giulia Romano", "Vice Questore", "Servizio per la Cooperazione", "giulia.romano@sci-it.example", "+39 06 5550 4410")],
    "PORTUGAL": [("João Ferreira", "Inspetor-Chefe", "Unidade de Coordenação Nacional", "j.ferreira@ucn-pt.example", "+351 21 555 0132"),
                 ("Inês Costa", "Inspetora", "Unidade de Coordenação Nacional", "", "+351 21 555 0170")],
}

def p(text, bold=False):
    rpr = "<w:rPr><w:b/></w:rPr>" if bold else ""
    return f'<w:p><w:r>{rpr}<w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>'

def table(rows):
    trs = "".join("<w:tr>" + "".join(f"<w:tc>{p(c)}</w:tc>" for c in r) + "</w:tr>" for r in rows)
    return f"<w:tbl>{trs}</w:tbl>"

body = p("Workshop participants (fictional data)", True)
for country, people in groups.items():
    body += p(country, True)
    body += table([("Nombre", "Cargo", "Organismo", "Correo", "Teléfono")] + people)
doc = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{body}</w:body></w:document>'
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    z.writestr("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    z.writestr("word/document.xml", doc)
print("written", out)
