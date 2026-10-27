// Standalone HTML directory: one file, no external resources, works offline from file://.
// All participant data is embedded as JSON (escaped) and rendered with DOM APIs (textContent), never innerHTML.
import { participantCountryLabel } from '../countries'
import { translate, type Lang } from '../i18n'
import { displayName, sortName } from '../participants'
import { phoneInfo, telHref } from '../phone'
import { isValidEmail } from '../text'
import type { Participant, Project } from '../types'
import { encryptText } from './crypto'

/** JSON safe to place inside <script type="application/json"> (no "</script>", no HTML parsing surprises). */
export function jsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

async function flagDataUris(codes: string[], flagUrl: (c: string) => string | undefined) {
  const out: Record<string, string> = {}
  await Promise.all(
    codes.map(async (code) => {
      const url = flagUrl(code)
      if (!url) return
      try {
        let svg: string
        if (url.startsWith('data:')) {
          // small flags are inlined by the bundler as URL-encoded or base64 data URIs
          const [meta, payload] = url.split(',', 2)
          svg = meta.endsWith(';base64') ? decodeURIComponent(escape(atob(payload))) : decodeURIComponent(payload)
        } else svg = await (await fetch(url)).text()
        const trimmed = svg.trim()
        if (!trimmed.startsWith('<svg') && !trimmed.startsWith('<?xml')) return
        if (/<script|\son\w+\s*=|javascript:/i.test(svg)) return
        out[code] = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)))
      } catch {
        /* flag omitted */
      }
    }),
  )
  return out
}

export interface HtmlPayload {
  project: { name: string; location: string; dates: string; description: string }
  generated: string
  lang: Lang
  labels: Record<string, string>
  custom: string[]
  people: {
    c: string // country code
    cl: string // country label
    n: string // display name
    s: string // sort name
    fn: string
    ln: string
    t: string
    o: string
    d: string
    e: string // validated email or ''
    er: string // email as written
    p: string // phone as written
    pt: string // tel: link
    w: string // whatsapp as written
    wl: string // wa.me link
    no: string
    cu: Record<string, string>
  }[]
  flags: Record<string, string>
}

export async function buildHtmlPayload(project: Project, list: Participant[], lang: Lang, flagUrl: (c: string) => string | undefined): Promise<HtmlPayload> {
  const t = (k: Parameters<typeof translate>[1]) => translate(lang, k)
  const f = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' })
  const codes = [...new Set(list.map((p) => p.country).filter(Boolean))]
  return {
    project: {
      name: project.name,
      location: project.location,
      dates: [project.startDate && f(project.startDate), project.endDate && f(project.endDate)].filter(Boolean).join(' – '),
      description: project.description,
    },
    generated: new Date().toLocaleString(lang),
    lang,
    labels: {
      search: t('searchPlaceholder'),
      allCountries: t('allCountries'),
      participants: t('statParticipants'),
      name: t('f_name'),
      countries: t('statCountries'),
      noResults: t('noResults'),
      noCountry: t('noCountry'),
      email: t('actEmail'),
      call: t('actCall'),
      whatsapp: t('actWhatsapp'),
      save: t('actSaveContact'),
      copy: t('actCopyAll'),
      copied: t('copied'),
      sortAsc: t('sortAsc'),
      sortDesc: t('sortDesc'),
      expand: t('expandAll'),
      collapse: t('collapseAll'),
      jobTitle: t('f_jobTitle'),
      organisation: t('f_organisation'),
      department: t('f_department'),
      phone: t('f_phone'),
      notes: t('f_notes'),
      generated: lang === 'es' ? 'Generado' : 'Generated',
      personal: lang === 'es' ? 'Contiene datos personales. No lo compartas sin autorización.' : 'Contains personal data. Do not share without authorisation.',
      password: t('password'),
      unlock: lang === 'es' ? 'Abrir' : 'Open',
      locked: lang === 'es' ? 'Este directorio está protegido con contraseña.' : 'This directory is password protected.',
      wrong: t('wrongPassword'),
      noCrypto: lang === 'es' ? 'Este navegador no puede descifrar el archivo. Ábrelo con Chrome, Edge o Firefox actualizados.' : 'This browser cannot decrypt the file. Open it with an up-to-date Chrome, Edge or Firefox.',
    },
    custom: project.customFields,
    people: list.map((p) => {
      const email = isValidEmail(p.email) ? p.email.trim() : ''
      const tel = (p.phone && telHref(p.phone, p.country)) || (p.whatsapp && telHref(p.whatsapp, p.country)) || ''
      const wa = phoneInfo(p.whatsapp || p.phone, p.country).e164
      return {
        c: p.country,
        cl: participantCountryLabel(p, lang),
        n: displayName(p),
        s: sortName(p),
        fn: p.firstName,
        ln: p.lastName,
        t: p.jobTitle,
        o: p.organisation,
        d: p.department,
        e: email,
        er: p.email,
        p: p.phone,
        pt: tel,
        w: p.whatsapp,
        wl: wa ? 'https://wa.me/' + wa.slice(1) : '',
        no: p.notes,
        cu: p.custom ?? {},
      }
    }),
    flags: await flagDataUris(codes, flagUrl),
  }
}

const CSS = `
:root{--bg:#081426;--s1:#0d1d34;--s2:#10243e;--line:#1d3a5f;--fg:#e8eff8;--mut:#8ea3bf;--cy:#35bce8;--bl:#4d9bff;--gr:#25d366;--alt:#0f2340;--grp:#12294a;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(1000px 500px at 90% -10%,rgba(31,111,224,.14),transparent 60%),var(--bg);color:var(--fg);font:15px/1.5 "Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;min-height:100vh}
.wrap{max-width:1280px;margin:0 auto;padding:28px max(16px,env(safe-area-inset-left)) 48px}
header.top{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end;justify-content:space-between;margin-bottom:20px}
.eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--cy);font-weight:700}
h1{margin:4px 0 6px;font-size:clamp(22px,3.4vw,30px);line-height:1.15}
.meta{color:var(--mut);font-size:14px;display:flex;flex-wrap:wrap;gap:4px 18px}
.desc{color:var(--mut);font-size:14px;max-width:75ch;margin:8px 0 0}
.stats{display:flex;gap:10px}
.stat{background:linear-gradient(160deg,var(--s2),var(--s1));border:1px solid rgba(53,188,232,.45);box-shadow:0 0 22px -8px rgba(53,188,232,.35);border-radius:12px;padding:10px 16px;min-width:110px}
.stat b{display:block;font-size:22px;font-variant-numeric:tabular-nums}
.stat span{font-size:12px;color:var(--mut)}
.bar{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,240px) auto auto;gap:10px;background:var(--s1);border:1px solid var(--line);border-radius:14px;padding:10px;margin-bottom:16px;position:sticky;top:0;z-index:5}
input,select,button{font:inherit;color:inherit}
input[type=search],select{width:100%;height:40px;border-radius:9px;border:1px solid var(--line);background:#0b1a2f;padding:0 12px;min-width:0}
button{cursor:pointer}
.btn{height:40px;border-radius:9px;border:1px solid var(--line);background:#0b1a2f;padding:0 12px;white-space:nowrap}
.btn:hover{border-color:var(--cy)}
:focus-visible{outline:2px solid var(--cy);outline-offset:2px}
.count{color:var(--mut);font-size:13px;margin:0 2px 10px}
.panel{background:var(--s1);border:1px solid var(--line);border-radius:14px;overflow:hidden}
table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);font-weight:600;padding:10px 12px;border-bottom:1px solid var(--line)}
td{padding:10px 12px;border-bottom:1px solid rgba(29,58,95,.6);vertical-align:middle}
tr.p:nth-child(even) td{background:var(--alt)}
tr.g td{background:var(--grp);padding:8px 12px}
.gbtn{all:unset;cursor:pointer;display:flex;align-items:center;gap:10px;width:100%;font-weight:700;font-size:13px;letter-spacing:.08em;text-transform:uppercase}
.gbtn:focus-visible{outline:2px solid var(--cy)}
.n{border-radius:99px;background:rgba(53,188,232,.15);color:var(--cy);font-size:12px;padding:0 8px;letter-spacing:0}
.chev{margin-left:auto;color:var(--mut);transition:transform .15s}
.collapsed .chev{transform:rotate(-90deg)}
.flag{width:24px;height:18px;border-radius:3px;object-fit:cover;box-shadow:0 0 0 1px rgba(0,0,0,.3);flex:none;background:#173257}
.nm{font-weight:600}
.sub{font-size:12.5px;color:var(--mut)}
.mono{font-family:ui-monospace,"SFMono-Regular",Consolas,monospace;font-size:13px;white-space:nowrap}
.acts{display:flex;gap:2px;justify-content:flex-end}
.a{width:34px;height:34px;display:grid;place-items:center;border-radius:8px;color:var(--mut);text-decoration:none;border:0;background:transparent}
.a:hover{background:#142b48}
.a svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.a.m{color:var(--bl)} .a.t{color:#8fb4ff} .a.w{color:var(--gr)} .a.s{color:var(--cy)}
.a.off{opacity:.2;pointer-events:none}
.empty{padding:40px;text-align:center;color:var(--mut)}
.cards{display:none}
.card{background:var(--s1);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:10px}
.ctry{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);margin:18px 4px 8px}
footer{margin-top:28px;color:var(--mut);font-size:12px;display:flex;flex-wrap:wrap;gap:8px 20px;justify-content:space-between}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#123a2a;border:1px solid #2f8f60;color:#d8ffe9;padding:8px 14px;border-radius:10px;font-size:14px;opacity:0;transition:opacity .2s;pointer-events:none}
.toast.on{opacity:1}
.lock{max-width:420px;margin:12vh auto;background:var(--s1);border:1px solid var(--line);border-radius:16px;padding:24px;display:grid;gap:12px}
.lock input{height:44px;border-radius:9px;border:1px solid var(--line);background:#0b1a2f;padding:0 12px}
.lock button{height:44px;border-radius:9px;border:0;background:#1f6fe0;color:#fff;font-weight:600}
.err{color:#ff9aa0;font-size:14px;min-height:1.2em}
@media (max-width:760px){
  .bar{grid-template-columns:1fr 1fr;position:static}
  .bar input{grid-column:1/-1}
  .panel{display:none}
  .cards{display:block}
  .stats{width:100%}
  .stat{flex:1}
}
@media print{
  :root{--bg:#fff;--s1:#fff;--s2:#fff;--fg:#000;--mut:#444;--line:#bbb;--alt:#f3f5f8;--grp:#e6ecf4;color-scheme:light}
  body{background:#fff;color:#000;font-size:11px}
  .bar,.acts,.toast,.cards,.chev,th:last-child,td:last-child{display:none!important}
  .panel{display:block!important;border:0}
  .stat{box-shadow:none;border-color:#bbb}
  tr{break-inside:avoid}
  tr.g td{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  tbody.collapsed tr.p{display:table-row!important}
  a{color:#000;text-decoration:none}
}
`

// The viewer script. It only uses textContent / setAttribute with validated values.
const SCRIPT = String.raw`
(function(){
"use strict";
var raw = document.getElementById('pm-data').textContent;
var ICON = {
 m:'<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="m22 7-10 6L2 7"/>',
 t:'<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
 w:'<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M9.5 8.5c0 3.3 2.7 6 6 6l1-1.5-2-1-1 .8a4 4 0 0 1-2.3-2.3l.8-1-1-2z" fill="currentColor" stroke="none"/>',
 s:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
 c:'<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
 v:'<path d="m6 9 6 6 6-6"/>'
};
function svg(name){var NS='http://www.w3.org/2000/svg';var s=document.createElementNS(NS,'svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('aria-hidden','true');
 var tmp=new DOMParser().parseFromString('<svg xmlns="'+NS+'">'+ICON[name]+'</svg>','image/svg+xml').documentElement;while(tmp.firstChild)s.appendChild(tmp.firstChild);return s}
function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function fold(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function safeHref(h,kind){if(!h)return '';if(kind==='m')return /^mailto:[^\s<>"']+@[^\s<>"']+$/.test(h)?h:'';if(kind==='t')return /^tel:\+?[0-9]{4,20}$/.test(h)?h:'';if(kind==='w')return /^https:\/\/wa\.me\/[0-9]{6,16}$/.test(h)?h:'';return ''}

function start(D){
 var L=D.labels, root=document.getElementById('app'); root.textContent='';
 document.title=D.project.name;
 var coll=new Intl.Collator(D.lang,{sensitivity:'base',numeric:true});
 var people=D.people.map(function(p){p._q=fold([p.cl,p.n,p.t,p.o,p.d,p.er,p.p,p.w,p.no].concat(Object.keys(p.cu||{}).map(function(k){return p.cu[k]})).join(' '));return p});
 var wrap=el('div','wrap'); root.appendChild(wrap);
 var head=el('header','top'); wrap.appendChild(head);
 var hl=el('div'); head.appendChild(hl);
 hl.appendChild(el('div','eyebrow',L.participants));
 hl.appendChild(el('h1',null,D.project.name));
 var meta=el('div','meta'); if(D.project.location)meta.appendChild(el('span',null,D.project.location)); if(D.project.dates)meta.appendChild(el('span',null,D.project.dates)); hl.appendChild(meta);
 if(D.project.description)hl.appendChild(el('p','desc',D.project.description));
 var stats=el('div','stats'); head.appendChild(stats);
 function stat(v,l){var s=el('div','stat');s.appendChild(el('b',null,String(v)));s.appendChild(el('span',null,l));stats.appendChild(s)}
 var countries={}; people.forEach(function(p){countries[p.c||('~'+fold(p.cl))]=p.cl||L.noCountry});
 stat(people.length,L.participants); stat(Object.keys(countries).length,L.countries);

 var bar=el('div','bar'); wrap.appendChild(bar);
 var q=el('input'); q.type='search'; q.placeholder=L.search; q.setAttribute('aria-label',L.search); bar.appendChild(q);
 var sel=el('select'); sel.setAttribute('aria-label',L.allCountries); bar.appendChild(sel);
 var o0=el('option',null,L.allCountries); o0.value=''; sel.appendChild(o0);
 Object.keys(countries).sort(function(a,b){return coll.compare(countries[a],countries[b])}).forEach(function(k){var o=el('option',null,countries[k]);o.value=k;sel.appendChild(o)});
 var dir=1; var sortBtn=el('button','btn',L.sortAsc); sortBtn.type='button'; bar.appendChild(sortBtn);
 var collapsed={}; var allBtn=el('button','btn',L.collapse); allBtn.type='button'; bar.appendChild(allBtn);
 var count=el('div','count'); wrap.appendChild(count);
 var panel=el('div','panel'); wrap.appendChild(panel);
 var cards=el('div','cards'); wrap.appendChild(cards);
 var toast=el('div','toast'); toast.setAttribute('role','status'); document.body.appendChild(toast);
 function say(t){toast.textContent=t;toast.classList.add('on');setTimeout(function(){toast.classList.remove('on')},1600)}
 var foot=el('footer'); foot.appendChild(el('span',null,L.generated+': '+D.generated)); foot.appendChild(el('span',null,L.personal)); wrap.appendChild(foot);

 function key(p){return p.c||('~'+fold(p.cl))}
 function flag(p){var src=D.flags[p.c]; var i=el('img','flag'); i.alt=''; if(src&&/^data:image\/svg\+xml;base64,[A-Za-z0-9+\/=]+$/.test(src))i.src=src; return i}
 function vcard(p){
  function e(s){return String(s||'').replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;')}
  var l=['BEGIN:VCARD','VERSION:3.0','N:'+e(p.ln)+';'+e(p.fn||(p.ln?'':p.n))+';;;','FN:'+e(p.n||p.er||p.p)];
  if(p.o||p.d)l.push('ORG:'+e(p.o)+(p.d?';'+e(p.d):'')); if(p.t)l.push('TITLE:'+e(p.t)); if(p.er)l.push('EMAIL;TYPE=INTERNET,WORK:'+e(p.er));
  var tel=p.pt?p.pt.slice(4):p.p; if(tel)l.push('TEL;TYPE=WORK,VOICE:'+e(tel)); var wa=p.wl?'+'+p.wl.split('/').pop():''; if(wa&&wa!==tel)l.push('TEL;TYPE=CELL:'+e(wa));
  if(p.cl)l.push('ADR;TYPE=WORK:;;;;;;'+e(p.cl)); l.push('NOTE:'+e(D.project.name)); l.push('END:VCARD'); return l.join('\r\n')+'\r\n'}
 function download(p){var b=new Blob([vcard(p)],{type:'text/vcard;charset=utf-8'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download=(fold(p.n).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'contact')+'.vcf';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u)},20000)}
 function copy(p){var t=[p.n,p.t,[p.o,p.d].filter(Boolean).join(' – '),p.cl,p.er&&('Email: '+p.er),p.p&&('Tel: '+p.p),p.w&&p.w!==p.p&&('WhatsApp: '+p.w)].filter(Boolean).join('\n');
  function fb(){var ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();try{document.execCommand('copy')}catch(e){}ta.remove();say(L.copied)}
  if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(t).then(function(){say(L.copied)},fb);else fb()}
 function action(kind,href,label,name,onclick){var a;if(onclick){a=el('button','a '+kind);a.type='button';a.addEventListener('click',onclick)}else{a=el('a','a '+kind);var h=safeHref(href,kind);if(h){a.href=h;if(kind==='w'){a.target='_blank';a.rel='noopener noreferrer'}}else a.className+=' off'}
  a.title=label;a.setAttribute('aria-label',label+(name?': '+name:''));a.appendChild(svg(kind));return a}
 function actions(p){var d=el('div','acts');
  d.appendChild(action('m',p.e?'mailto:'+p.e:'',L.email,p.n));
  d.appendChild(action('t',p.pt,L.call,p.n));
  d.appendChild(action('w',p.wl,L.whatsapp,p.n));
  d.appendChild(action('s','',L.save,p.n,function(){download(p)}));
  d.appendChild(action('c','',L.copy,p.n,function(){copy(p)}));
  return d}

 function render(){
  var terms=fold(q.value).split(/\s+/).filter(Boolean), ck=sel.value;
  var list=people.filter(function(p){if(ck&&key(p)!==ck)return false;for(var i=0;i<terms.length;i++)if(p._q.indexOf(terms[i])<0)return false;return true});
  list.sort(function(a,b){if(!a.cl!==!b.cl)return a.cl?-1:1;return (coll.compare(a.cl,b.cl)||coll.compare(a.s,b.s))*dir});
  count.textContent=list.length+' / '+people.length;
  panel.textContent='';cards.textContent='';
  if(!list.length){panel.appendChild(el('div','empty',L.noResults));cards.appendChild(el('div','empty',L.noResults));return}
  var table=el('table'); var thead=el('thead'); var hr=el('tr');
  [L.name,L.jobTitle,L.organisation,'Email',L.phone].concat(D.custom).concat(['']).forEach(function(h){hr.appendChild(el('th',null,h))});
  thead.appendChild(hr); table.appendChild(thead);
  var groups=[]; list.forEach(function(p){var k=key(p);var g=groups[groups.length-1];if(!g||g.k!==k){g={k:k,p:p,items:[]};groups.push(g)}g.items.push(p)});
  var cols=6+D.custom.length;
  groups.forEach(function(g){
   var tb=el('tbody'); if(collapsed[g.k])tb.className='collapsed';
   var gr=el('tr','g'); var gd=el('td'); gd.colSpan=cols; var gb=el('button','gbtn'); gb.type='button'; gb.setAttribute('aria-expanded',String(!collapsed[g.k]));
   gb.appendChild(flag(g.p)); gb.appendChild(el('span',null,g.p.cl||L.noCountry)); gb.appendChild(el('span','n',String(g.items.length)));
   var ch=el('span','chev'); ch.appendChild(svg('v')); ch.firstChild.setAttribute('width','16'); ch.firstChild.setAttribute('height','16'); ch.firstChild.style.cssText='fill:none;stroke:currentColor;stroke-width:2'; gb.appendChild(ch);
   gb.addEventListener('click',function(){collapsed[g.k]=!collapsed[g.k];render()});
   gd.appendChild(gb); gr.appendChild(gd); tb.appendChild(gr);
   var sec=el('div'); var hd=el('div','ctry'); hd.appendChild(flag(g.p)); hd.appendChild(el('span',null,g.p.cl||L.noCountry)); hd.appendChild(el('span','n',String(g.items.length))); sec.appendChild(hd);
   g.items.forEach(function(p){
    if(!collapsed[g.k]){
     var tr=el('tr','p'); var td=el('td'); td.appendChild(el('div','nm',p.n||'—')); tr.appendChild(td);
     tr.appendChild(el('td','sub',p.t)); var to=el('td'); to.appendChild(el('div',null,p.o)); if(p.d)to.appendChild(el('div','sub',p.d)); tr.appendChild(to);
     tr.appendChild(el('td',null,p.er)); var tp=el('td','mono',p.p); if(p.w&&p.w!==p.p){tp.appendChild(el('div','sub','WhatsApp '+p.w))} tr.appendChild(tp);
     D.custom.forEach(function(c){tr.appendChild(el('td','sub',(p.cu||{})[c]||''))});
     var ta=el('td'); ta.appendChild(actions(p)); tr.appendChild(ta); tb.appendChild(tr);
    }
    var cd=el('div','card'); cd.appendChild(el('div','nm',p.n||'—')); var sb=[p.t,p.o].filter(Boolean).join(' · '); if(sb)cd.appendChild(el('div','sub',sb));
    if(p.er)cd.appendChild(el('div','sub',p.er)); if(p.p)cd.appendChild(el('div','mono',p.p)); cd.appendChild(actions(p)); if(!collapsed[g.k])sec.appendChild(cd);
   });
   hd.style.cursor='pointer'; hd.addEventListener('click',function(){collapsed[g.k]=!collapsed[g.k];render()});
   table.appendChild(tb); cards.appendChild(sec);
  });
  panel.appendChild(table);
  allBtn.textContent=Object.keys(collapsed).some(function(k){return collapsed[k]})?L.expand:L.collapse;
 }
 q.addEventListener('input',render); sel.addEventListener('change',render);
 sortBtn.addEventListener('click',function(){dir=-dir;sortBtn.textContent=dir>0?L.sortAsc:L.sortDesc;render()});
 allBtn.addEventListener('click',function(){var any=Object.keys(collapsed).some(function(k){return collapsed[k]});collapsed={};if(!any)people.forEach(function(p){collapsed[key(p)]=true});render()});
 window.addEventListener('beforeprint',function(){collapsed={};render()});
 render();
}

var data=JSON.parse(raw);
if(data && data.format==='pm-encrypted'){
 var L=JSON.parse(document.getElementById('pm-labels').textContent), root=document.getElementById('app');
 var box=el('form','lock'); box.appendChild(el('h1',null,document.title)); box.appendChild(el('p',null,L.locked));
 var pw=el('input'); pw.type='password'; pw.autocomplete='current-password'; pw.setAttribute('aria-label',L.password); pw.placeholder=L.password; box.appendChild(pw);
 var b=el('button',null,L.unlock); b.type='submit'; box.appendChild(b); var err=el('div','err'); err.setAttribute('role','alert'); box.appendChild(err); root.appendChild(box); pw.focus();
 function b64(s){var r=atob(s),u=new Uint8Array(r.length);for(var i=0;i<r.length;i++)u[i]=r.charCodeAt(i);return u}
 box.addEventListener('submit',function(ev){ev.preventDefault(); err.textContent='';
  if(!(window.crypto&&crypto.subtle)){err.textContent=L.noCrypto;return}
  b.disabled=true;
  var it=Math.min(Math.max(+data.iterations||0,100000),5000000);
  crypto.subtle.importKey('raw',new TextEncoder().encode(pw.value),'PBKDF2',false,['deriveKey']).then(function(k){
   return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:b64(data.salt),iterations:it},k,{name:'AES-GCM',length:256},false,['decrypt'])
  }).then(function(key){return crypto.subtle.decrypt({name:'AES-GCM',iv:b64(data.iv)},key,b64(data.data))}).then(function(buf){
   start(JSON.parse(new TextDecoder().decode(buf)))
  },function(){err.textContent=L.wrong;b.disabled=false});
 });
} else start(data);
})();
`

async function sha256Base64(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))
  let bin = ''
  d.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin)
}

export async function buildStandaloneHtml(payload: HtmlPayload, password?: string): Promise<string> {
  const dataJson = password ? jsonForHtml(await encryptText(JSON.stringify(payload), password)) : jsonForHtml(payload)
  const lockLabels = jsonForHtml({
    locked: payload.labels.locked,
    password: payload.labels.password,
    unlock: payload.labels.unlock,
    wrong: payload.labels.wrong,
    noCrypto: payload.labels.noCrypto,
  })
  const scriptHash = await sha256Base64(SCRIPT)
  // The page may run only its own script (by hash), show embedded images and make no network requests.
  const csp = `default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'`
  const title = password ? 'Participant directory' : payload.project.name
  return `<!doctype html>
<html lang="${payload.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
<div id="app"><noscript>JavaScript is required to view this directory.</noscript></div>
<script type="application/json" id="pm-data">${dataJson}</script>
<script type="application/json" id="pm-labels">${lockLabels}</script>
<script>${SCRIPT}</script>
</body>
</html>
`
}
