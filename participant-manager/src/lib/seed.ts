// Fictional demonstration data. All names, organisations, emails (.example domains) and numbers are invented.
import { addParticipants, createProject, db } from './db'
import { emptyDraft, type ParticipantDraft } from './types'

type Row = [country: string, first: string, last: string, title: string, org: string, dept: string, email: string, phone: string, wa?: string]

const CORE: Row[] = [
  ['DE', 'Katrin', 'Vogel', 'Head of Unit', 'Federal Coordination Office', 'International Cooperation', 'k.vogel@fco-de.example', '+49 30 5550 1820'],
  ['DE', 'Markus', 'Brandt', 'Liaison Officer', 'Federal Coordination Office', 'Liaison Desk', '', '+49 171 5550342', '+49 171 5550342'],
  ['AR', 'María Belén', 'Sosa', 'Investigator', 'Federal Investigations Service', 'Cyber Unit', 'mb.sosa@fis-ar.example', '+54 11 5555 0187', '+54 9 11 5555 0187'],
  ['BE', 'Elise', 'Janssens', 'Senior Analyst', 'National Crisis Centre', 'Strategic Analysis', 'elise.janssens@ncc-be.example', '+32 2 555 04 17'],
  ['BR', 'Rafael', 'Monteiro', 'Federal Agent', 'National Coordination Agency', 'Border Programme', 'r.monteiro@nca-br.example', '+55 61 5555 0342', '+55 61 95555 0342'],
  ['CA', 'Olivia', 'Bennett', 'Project Officer', 'Public Safety Coordination', 'Partnerships', 'olivia.bennett@psc-ca.example', '+1 613 555 0142'],
  ['CL', 'Tomás', 'Fuentealba', 'Subcomisario', 'Dirección Nacional de Coordinación', 'Asuntos Internacionales', 't.fuentealba@dnc-cl.example', '+56 2 2555 0190'],
  ['CO', 'Andrés', 'Rojas Mejía', 'Coronel', 'Dirección de Cooperación Internacional', 'Enlace Regional', 'andres.rojas@dci-co.example', '+57 601 555 2390', '+57 310 555 2390'],
  ['CO', 'Paula', 'Cárdenas', 'Capitán', 'Dirección de Cooperación Internacional', 'Análisis', 'p.cardenas@dci-co.example', ''],
  ['ES', 'Lucía', 'Herrera Gil', 'Comisaria', 'Unidad de Coordinación Internacional', 'Gabinete', 'lucia.herrera@uci-es.example', '+34 915 550 214', '+34 600 555 214'],
  ['ES', 'Javier', 'Ortega Ruiz', 'Inspector', 'Unidad de Coordinación Internacional', 'Cooperación Operativa', 'javier.ortega@uci-es.example', '+34 600 555 123', '+34 600 555 123'],
  ['ES', 'Nuria', 'Castells', 'Analista', 'Centro de Inteligencia Regional', '', 'n.castells@cir-es.example', ''],
  ['FR', 'Camille', 'Dubois', 'Commissaire divisionnaire', 'Office de coordination opérationnelle', 'Relations internationales', 'camille.dubois@oco-fr.example', '+33 1 55 50 12 34'],
  ['FR', 'Hugo', 'Lefèvre', 'Capitaine', 'Office de coordination opérationnelle', 'Cellule d’analyse', 'h.lefevre@oco-fr.example', '+33 6 55 50 98 76', '+33 6 55 50 98 76'],
  ['GR', 'Eleni', 'Papadaki', 'Police Major', 'Hellenic Coordination Directorate', 'Maritime Section', 'e.papadaki@hcd-gr.example', '+30 21 0555 0144'],
  ['IE', 'Ciarán', 'O’Sullivan', 'Detective Inspector', 'National Bureau of Coordination', '', 'c.osullivan@nbc-ie.example', '+353 1 555 0199'],
  ['IT', 'Giulia', 'Romano', 'Vice Questore', 'Servizio per la Cooperazione', 'Divisione II', 'giulia.romano@sci-it.example', '+39 06 5550 4410'],
  ['IT', 'Matteo', 'Esposito', 'Commissario', 'Servizio per la Cooperazione', 'Divisione III', '', ''],
  ['JP', 'Yuki', 'Tanaka', 'Superintendent', 'National Coordination Agency', 'International Affairs', 'y.tanaka@nca-jp.example', '+81 3 5555 0123'],
  ['MA', 'Youssef', 'El Amrani', 'Commissaire principal', 'Direction de la Coopération', 'Coopération bilatérale', 'y.elamrani@dc-ma.example', '+212 5 37 55 50 11', '+212 6 55 55 01 12'],
  ['MX', 'Fernanda', 'Galindo', 'Directora de Área', 'Secretaría de Coordinación Regional', 'Asuntos Internacionales', 'f.galindo@scr-mx.example', '+52 55 5555 0177'],
  ['NL', 'Sanne', 'de Vries', 'Strategic Advisor', 'National Coordination Unit', 'Policy', 's.devries@ncu-nl.example', '+31 70 555 0123'],
  ['PE', 'Diego', 'Quispe Huamán', 'Mayor', 'Dirección de Cooperación Policial', '', 'd.quispe@dcp-pe.example', '+51 1 555 0163'],
  ['PL', 'Agnieszka', 'Nowak', 'Head of Section', 'Central Coordination Bureau', 'International Section', 'a.nowak@ccb-pl.example', '+48 22 555 01 45'],
  ['PT', 'João', 'Ferreira', 'Inspetor-Chefe', 'Unidade de Coordenação Nacional', 'Cooperação Internacional', 'j.ferreira@ucn-pt.example', '+351 21 555 0132'],
  ['RO', 'Andrei', 'Popescu', 'Chief Commissioner', 'General Directorate for Coordination', '', 'a.popescu@gdc-ro.example', '+40 21 555 0177'],
  ['SE', 'Linnea', 'Berg', 'Detective Superintendent', 'National Operations Department', 'International Unit', 'linnea.berg@nod-se.example', '+46 8 555 012 34'],
  ['SN', 'Aminata', 'Diop', 'Commissaire', 'Direction de la Coordination', 'Interpol & Coopération', 'a.diop@dc-sn.example', '+221 33 555 01 23', '+221 77 555 01 23'],
  ['GB', 'James', 'Whitfield', 'Programme Manager', 'National Coordination Agency', 'International Partnerships', 'james.whitfield@nca-uk.example', '+44 20 7946 0958'],
  ['GB', 'Priya', 'Raman', 'Senior Investigator', 'National Coordination Agency', 'Economic Crime', 'p.raman@nca-uk.example', '+44 7700 900123', '+44 7700 900123'],
  ['US', 'Daniel', 'Brooks', 'Attaché', 'Department of Regional Coordination', 'Liaison Office', 'daniel.brooks@drc-us.example', '+1 202 555 0175'],
  ['UY', 'Valentina', 'Pereyra', 'Comisario Mayor', 'Dirección de Asuntos Internacionales', '', 'v.pereyra@dai-uy.example', '+598 2 555 0123'],
  // deliberate duplicate for demonstrating detection/merge (same email, different spelling)
  ['ES', 'Lucia', 'Herrera', 'Comisaria', 'U. Coordinación Internacional', '', 'lucia.herrera@uci-es.example', '+34 915550214'],
  // incomplete record: no country and no contact information
  ['', 'Observer', 'Pending confirmation', '', 'Regional Partner Organisation', '', '', ''],
]

const TASK_FORCE: Row[] = [
  ['AR', 'Martín', 'Acosta', 'Comisario', 'Federal Investigations Service', 'Delitos Complejos', 'm.acosta@fis-ar.example', '+54 11 5555 0144'],
  ['BO', 'Carla', 'Mamani', 'Teniente Coronel', 'Viceministerio de Coordinación', '', 'c.mamani@vmc-bo.example', '+591 2 555 0101'],
  ['BR', 'Beatriz', 'Almeida', 'Delegada', 'National Coordination Agency', 'Cooperação', 'b.almeida@nca-br.example', '+55 61 5555 0199'],
  ['CL', 'Ignacio', 'Vergara', 'Inspector', 'Dirección Nacional de Coordinación', '', 'i.vergara@dnc-cl.example', ''],
  ['CO', 'Laura', 'Restrepo', 'Mayor', 'Dirección de Cooperación Internacional', 'Fronteras', 'l.restrepo@dci-co.example', '+57 601 555 2401'],
  ['EC', 'Santiago', 'Villacís', 'Coronel', 'Comando de Coordinación', '', 's.villacis@cc-ec.example', '+593 2 555 0118'],
  ['ES', 'Marta', 'Domínguez', 'Inspectora Jefa', 'Unidad de Coordinación Internacional', 'Iberoamérica', 'm.dominguez@uci-es.example', '+34 915 550 377'],
  ['MX', 'Rodrigo', 'Salinas', 'Comisario', 'Secretaría de Coordinación Regional', '', 'r.salinas@scr-mx.example', '+52 55 5555 0102'],
  ['PA', 'Gabriela', 'Moreno', 'Subcomisionada', 'Dirección de Investigación', '', 'g.moreno@di-pa.example', '+507 555 0133'],
  ['PE', 'Luis', 'Chávez', 'Comandante', 'Dirección de Cooperación Policial', 'Análisis', '', '+51 1 555 0188'],
  ['PY', 'Sofía', 'Benítez', 'Comisario', 'Departamento de Coordinación', '', 's.benitez@dc-py.example', '+595 21 555 012'],
  ['UY', 'Federico', 'Rodríguez', 'Inspector Mayor', 'Dirección de Asuntos Internacionales', '', 'f.rodriguez@dai-uy.example', '+598 2 555 0177'],
  ['US', 'Megan', 'Carter', 'Regional Liaison', 'Department of Regional Coordination', '', 'megan.carter@drc-us.example', '+1 305 555 0110'],
  ['PT', 'Inês', 'Costa', 'Inspetora', 'Unidade de Coordenação Nacional', '', 'i.costa@ucn-pt.example', '+351 21 555 0170'],
]

const WORKSHOP: Row[] = [
  ['AT', 'Lukas', 'Huber', 'Trainer', 'Federal Training Academy', 'Curriculum', 'l.huber@fta-at.example', '+43 1 555 0121'],
  ['BG', 'Mila', 'Ivanova', 'Inspector', 'National Training Centre', '', 'm.ivanova@ntc-bg.example', '+359 2 555 0144'],
  ['HR', 'Ivan', 'Kovačević', 'Instructor', 'Police Academy', '', 'i.kovacevic@pa-hr.example', '+385 1 555 0166'],
  ['CZ', 'Tereza', 'Dvořáková', 'Analyst', 'Coordination Directorate', 'Training', 't.dvorakova@cd-cz.example', '+420 2 5555 0123'],
  ['FI', 'Aino', 'Virtanen', 'Senior Officer', 'National Training Board', '', 'a.virtanen@ntb-fi.example', '+358 9 555 0101'],
  ['FR', 'Léa', 'Moreau', 'Formatrice', 'École nationale de coordination', '', 'l.moreau@enc-fr.example', '+33 4 55 50 11 22'],
  ['DE', 'Jonas', 'Schmidt', 'Course Director', 'Federal Training Academy', 'Leadership', 'j.schmidt@fta-de.example', '+49 611 5550 230'],
  ['HU', 'Zsófia', 'Nagy', 'Major', 'Training Command', '', 'zs.nagy@tc-hu.example', '+36 1 555 0123'],
  ['LT', 'Rūta', 'Kazlauskienė', 'Chief Specialist', 'Coordination Service', '', 'r.kazlauskiene@cs-lt.example', '+370 5 555 0123'],
  ['SI', 'Nejc', 'Novak', 'Instructor', 'Police Academy', '', 'n.novak@pa-si.example', '+386 1 555 0101'],
  ['ES', 'Álvaro', 'Navarro', 'Profesor', 'Centro de Altos Estudios', 'Formación Internacional', 'a.navarro@cae-es.example', '+34 913 550 188'],
]

function toDrafts(rows: Row[]): ParticipantDraft[] {
  return rows.map(([country, first, last, title, org, dept, email, phone, wa]) => ({
    ...emptyDraft(),
    country,
    countryRaw: country,
    firstName: first,
    lastName: last,
    jobTitle: title,
    organisation: org,
    department: dept,
    email,
    phone,
    whatsapp: wa ?? '',
  }))
}

export async function loadDemoData(): Promise<string> {
  const p1 = await createProject({
    name: 'International Coordination Meeting',
    location: 'Madrid, Spain',
    startDate: '2026-11-17',
    endDate: '2026-11-19',
    description: 'Annual coordination meeting of national contact points. Fictional demonstration data.',
    customFields: ['Delegation'],
    demo: true,
  })
  const drafts = toDrafts(CORE)
  drafts.forEach((d, i) => {
    if (i % 5 === 0 && d.country) d.custom = { Delegation: i === 0 ? 'Head of delegation' : 'Delegate' }
  })
  await addParticipants(p1.id, drafts)

  const p2 = await createProject({
    name: 'Regional Task Force Conference',
    location: 'Lima, Peru',
    startDate: '2027-02-09',
    endDate: '2027-02-11',
    description: 'Regional task force on cross-border cooperation. Fictional demonstration data.',
    demo: true,
  })
  await addParticipants(p2.id, toDrafts(TASK_FORCE))

  const p3 = await createProject({
    name: 'Multinational Training Workshop',
    location: 'Ljubljana, Slovenia',
    startDate: '2027-04-20',
    endDate: '2027-04-23',
    description: 'Train-the-trainers workshop. Fictional demonstration data.',
    demo: true,
  })
  await addParticipants(p3.id, toDrafts(WORKSHOP))
  return p1.id
}

export async function removeDemoData() {
  const demos = await db.projects.filter((p) => !!p.demo).toArray()
  await db.transaction('rw', db.projects, db.participants, async () => {
    for (const p of demos) {
      await db.participants.where('projectId').equals(p.id).delete()
      await db.projects.delete(p.id)
    }
  })
}
