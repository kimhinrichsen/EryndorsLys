// Udvidet Quest Generator v3 – kompakt
// Bevarer API: generateQuestList(count, opts?), updateQuestProgress(quest, amount)
// Tilføjer: 60 families (10 pr. arketype) => >500 unikke signaturer (reelt tusinder)
// Level-gating (global minLevel / optional maxLevel), arketype-rarity vægtning, progress-begrænsning, duplikat-cooldown.

const archetypes = [
  { id:"skyggeskriver", name:"Skyggeskriver", icon:"🧙‍♂️" },
  { id:"horisontløber", name:"Horisontløber", icon:"🏇" },
  { id:"tågevogter", name:"Tågevogter", icon:"🌿" },
  { id:"sagnsmed", name:"Sagnsmed", icon:"🛡️" },
  { id:"nattesøger", name:"Nattesøger", icon:"🦉" },
  { id:"trådmester", name:"Trådmester", icon:"🤹‍♂️" }
];

// Rarity vægte pr. global level
const RARITY_WEIGHTS_BY_LEVEL = [
  { maxLevel:2, weights:{common:.86, uncommon:.14, rare:0,   epic:0} },
  { maxLevel:4, weights:{common:.72, uncommon:.22, rare:.06, epic:0} },
  { maxLevel:6, weights:{common:.58, uncommon:.26, rare:.12, epic:.04} },
  { maxLevel:8, weights:{common:.50, uncommon:.28, rare:.16, epic:.06} },
  { maxLevel:99,weights:{common:.44, uncommon:.30, rare:.18, epic:.08} }
];
function rarityWeightsForLevel(L){ return (RARITY_WEIGHTS_BY_LEVEL.find(e=>L<=e.maxLevel)||RARITY_WEIGHTS_BY_LEVEL.at(-1)).weights; }
function maxProgressAllowed(L){ if(L<3) return 1; if(L<5) return 2; if(L<7) return 3; return 4; }

const SIGNATURE_RECENT_BUFFER = 160;
const recentSignatures = [];
function registerSignature(s){ recentSignatures.push(s); if(recentSignatures.length>SIGNATURE_RECENT_BUFFER) recentSignatures.splice(0,recentSignatures.length-SIGNATURE_RECENT_BUFFER); }
function sigRecent(s){ return recentSignatures.includes(s); }

function ri(min,max,step=1){ const span=Math.floor((max-min)/step); return min+Math.floor(Math.random()*(span+1))*step; }
function pick(a){ return a[Math.floor(Math.random()*a.length)]; }

function numberRange(spec, level){
  const [mn,mx]=spec.scale?spec.scale(level):spec.range;
  return ri(mn,mx,spec.step||1);
}
function pickList(spec, level){
  const vals = spec.values?spec.values(level):spec.valuesStatic||[];
  if((spec.picks||1)===1) return pick(vals);
  const pool=[...vals], out=[];
  while(out.length<spec.picks && pool.length){
    out.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);
  }
  return out;
}
function genVars(family, level){
  const v={};
  for(const k in family.variableSpec){
    const spec=family.variableSpec[k];
    if(spec.type==='numberRange') v[k]=numberRange(spec, level);
    else if(spec.type==='pickList') v[k]=pickList(spec, level);
  }
  return v;
}
function fillTemplate(tpl, vars){
  let s=tpl;
  for(const k in vars){
    const val=Array.isArray(vars[k])?vars[k].join(', '):vars[k];
    s=s.replaceAll(`{${k}}`, val);
  }
  return s;
}
function weightedSelect(items, weights){
  const sum=weights.reduce((a,b)=>a+b,0)||1;
  let r=Math.random()*sum;
  for(let i=0;i<items.length;i++){ r-=weights[i]; if(r<=0) return items[i]; }
  return items.at(-1);
}

function rarityFactor(r){ return ({common:1,uncommon:1.25,rare:1.6,epic:2.3}[r])||1; }

let questIdCounter=1;
function nextId(){ return 'qf'+(questIdCounter++); }

function buildQuest(family, vars, playerLevel, archetypeLevels){
  const nameTpl=pick(family.grammar.names);
  const descTpl=pick(family.grammar.descs);
  const name=fillTemplate(nameTpl, vars);
  const desc=fillTemplate(descTpl, vars);
  const arch = archetypes.find(a=>a.id===family.archetype);
  const aLvl = archetypeLevels?.[family.archetype]||1;
  const base = family.reward?family.reward(vars, playerLevel, aLvl):10;
  const xp=Math.round(base * rarityFactor(family.rarity));
  const sig = family.signature?family.signature(vars):family.id+'::'+JSON.stringify(vars);
  return {
    id: nextId(),
    archetype: arch.id,
    icon: arch.icon,
    name, desc,
    xp,
    level: Math.max(family.minLevel||1, playerLevel),
    type: family.type,
    goal: family.goalKey||null,
    vars,
    progress: family.type==='progress'?0:null,
    completed:false,
    rarity: family.rarity,
    signature:sig
  };
}

// -------- Families pr. arketype (10 hver). Fokus: variation + skalering. --------
// Konvention: minLevel global. (Optional: maxLevel). goalKey for progress.
const skyggeskriverFamilies = [
  {
    id:'read_short', archetype:'skyggeskriver', rarity:'common', type:'instant', minLevel:1,
    variableSpec:{
      pages:{type:'numberRange', scale(L){return L<3?[5,30]:L<6?[25,55]:[50,90];}, step:5},
      book:{type:'pickList', values(L){return L<4?['den gamle krønike','Eryndors saga','munkens dagbog','støvet manuskript','runebogen']:
          ['glemte annaler','stjernetavlerne','arkivbindet','skyggeprotokollen','lysarkivet'];}, picks:1}
    },
    grammar:{
      names:['Læs {pages} sider i {book}','Studér {pages} sider fra {book}','Fordybelse: {book} ({pages} sider)'],
      descs:['Læs {pages} sider i {book}.','Tag {book} og nå {pages} sider.','Udvid din viden: {pages} sider fra {book}.']
    },
    signature(v){return `rs_${v.pages}_${v.book}`;},
    reward(v){return 4+v.pages*0.55;}
  },
  {
    id:'read_focus', archetype:'skyggeskriver', rarity:'uncommon', type:'instant', minLevel:2,
    variableSpec:{
      theme:{type:'pickList', values(){return ['heltemod','forfald','håb','mystik','skygge','forvandling','tavshed'];}, picks:1},
      lines:{type:'numberRange', scale(L){return L<5?[6,14]:[10,22];}, step:2}
    },
    grammar:{
      names:['Udvælg {lines} linjer om {theme}','Temauddrag: {theme} ({lines} linjer)','Notér {lines} linjer ({theme})'],
      descs:['Find {lines} linjer der viser {theme}.','Marker {lines} linjer hvor {theme} fremstår.','Udtræk {lines} linjer med fokus på {theme}.']
    },
    signature(v){return `rf_${v.theme}_${v.lines}`;},
    reward(v){return 14+v.lines;}
  },
  {
    id:'annotate', archetype:'skyggeskriver', rarity:'uncommon', type:'instant', minLevel:3,
    variableSpec:{ motif:{type:'pickList', values(){return ['lys','skygger','cirkler','navne','symbolik','ritual'];}, picks:1}},
    grammar:{
      names:['Annotér et afsnit ({motif})','Marginalia: {motif}','Kommentarspor: {motif}'],
      descs:['Skriv noter til et afsnit om {motif}.','Tilføj marginalia med fokus på {motif}.','Udbyg forståelsen af {motif} i et afsnit.']
    },
    signature(v){return `an_${v.motif}`;}, reward(){return 22;}
  },
  {
    id:'summarize', archetype:'skyggeskriver', rarity:'common', type:'instant', minLevel:2,
    variableSpec:{
      paragraphs:{type:'numberRange', scale(L){return L<5?[2,4]:[3,6];}, step:1},
      tone:{type:'pickList', values(){return ['nøgtern','poetisk','kort'];}, picks:1}
    },
    grammar:{
      names:['Opsummer {paragraphs} afsnit ({tone})','Lav {tone} resume af {paragraphs} afsnit','Resume: {paragraphs} ({tone})'],
      descs:['Skriv et {tone} resume af {paragraphs} afsnit.','Sammenfat {paragraphs} afsnit i {tone} stil.','Komprimer {paragraphs} afsnit til et {tone} resume.']
    },
    signature(v){return `su_${v.paragraphs}_${v.tone}`;},
    reward(v){return 10+v.paragraphs*4;}
  },
  {
    id:'glossary_terms', archetype:'skyggeskriver', rarity:'uncommon', type:'progress', minLevel:3, goalKey:'terms',
    variableSpec:{ terms:{type:'numberRange', scale(L){return L<6?[5,9]:[8,14];}, step:1}},
    grammar:{
      names:['Udarbejd {terms} ordforklaringer','Skab {terms} ord i gloseliste','Tekstglossar: {terms} termer'],
      descs:['Identificér og forklar {terms} termer.','Tilføj {terms} nye ordforklaringer til din liste.','Udbyg gloselisten med {terms} termer.']
    },
    signature(v){return `gl_${v.terms}`;},
    reward(v){return 18+v.terms*3;},
    durationClass:'medium'
  },
  {
    id:'cipher_fragments', archetype:'skyggeskriver', rarity:'rare', type:'progress', minLevel:5, goalKey:'fragments',
    variableSpec:{ fragments:{type:'numberRange', scale(L){return L<7?[3,5]:[4,7];}, step:1}},
    grammar:{
      names:['Dekryptér {fragments} fragmenter','Løs kodeskrift ({fragments})','Afkod {fragments} sektioner'],
      descs:['Afkod {fragments} krypterede tekststykker.','Brud koden i {fragments} fragmenter.','Genskab mening i {fragments} sektioner.']
    },
    signature(v){return `cf_${v.fragments}`;},
    reward(v){return 40+v.fragments*12;},
    durationClass:'long'
  },
  {
    id:'compare_passages', archetype:'skyggeskriver', rarity:'uncommon', type:'instant', minLevel:4,
    variableSpec:{
      passages:{type:'numberRange', scale(L){return L<6?[2,3]:[3,4];}, step:1},
      focus:{type:'pickList', values(){return ['tone','symbolik','tempo','billeder'];}, picks:1}
    },
    grammar:{
      names:['Sammenlign {passages} afsnit ({focus})','Kontrastér {passages} passager – {focus}','Analysér {passages} passager ({focus})'],
      descs:[
        'Skriv forskelle mellem {passages} passager mht. {focus}.',
        'Kortlæg ligheder og forskelle i {passages} afsnit (fokus: {focus}).',
        'Udarbejd kort analyse af {passages} passager ( {focus} ).'
      ]
    },
    signature(v){return `cp_${v.passages}_${v.focus}`;},
    reward(v){return 26+v.passages*4;}
  },
  {
    id:'night_reflection', archetype:'skyggeskriver', rarity:'common', type:'instant', minLevel:1,
    variableSpec:{
      words:{type:'numberRange', scale(L){return L<4?[40,70]:[60,110];}, step:10}
    },
    grammar:{
      names:['Natlig refleksion ({words} ord)','Aftenafsnit: {words} ord','Skriv {words} refleksionsord'],
      descs:['Skriv {words} ord med dagens indsigter.','Formuler {words} ord om læring i dag.','Notér {words} ord refleksion.']
    },
    signature(v){return `nr_${v.words}`;},
    reward(v){return 8+v.words*0.5;}
  },
  {
    id:'script_copy', archetype:'skyggeskriver', rarity:'common', type:'instant', minLevel:2,
    variableSpec:{
      lines:{type:'numberRange', scale(L){return L<5?[6,14]:[10,20];}, step:2}
    },
    grammar:{
      names:['Kopiér {lines} linjer','Afskriv {lines} linjer','Skriveøvelse: {lines} linjer'],
      descs:['Afskriv {lines} linjer for hånd.','Skriv {lines} linjer for at styrke form.','Kopiér nøje {lines} linjer.']
    },
    signature(v){return `sc_${v.lines}`;},
    reward(v){return 6+v.lines*1.4;}
  },
  {
    id:'ritual_notes', archetype:'skyggeskriver', rarity:'epic', type:'progress', minLevel:7, goalKey:'segments',
    variableSpec:{ segments:{type:'numberRange', scale(){return [4,6];}, step:1}},
    grammar:{
      names:['Ritualdokument: {segments} sektioner','Nedskriv ritual ({segments} dele)','Komponer {segments} ritualsegmenter'],
      descs:['Udform dokument med {segments} sektioner af et ritual.','Skitsér et ritual i {segments} sammenhængende dele.','Nedskriv {segments} segmenter inkl. formål.']
    },
    signature(v){return `rn_${v.segments}`;},
    reward(v){return 80+v.segments*18;},
    durationClass:'long'
  }
];

const horisontloeberFamilies = [
  {
    id:'walk_short', archetype:'horisontløber', rarity:'common', type:'instant', minLevel:1,
    variableSpec:{
      distance:{type:'numberRange', scale(L){return L<3?[1,5]:L<6?[3,8]:[5,11];}, step:1},
      område:{type:'pickList', values(L){return L<4?['skoven','marken','langs floden','bakkerne']:
        ['skoven','højdedraget','ruinernes kant','slettens rand','granlunden'];}, picks:1}
    },
    grammar:{
      names:['Gå {distance} km i {område}','Patruljér {område} ({distance} km)','Rundtur {distance} km – {område}'],
      descs:['Gå {distance} km i {område}.','Fuldfør {distance} km gennem {område}.','Hold tempo: {distance} km i {område}.']
    },
    signature(v){return `ws_${v.distance}_${v.område}`;},
    reward(v){return 5+v.distance*2;}
  },
  {
    id:'walk_interval', archetype:'horisontløber', rarity:'uncommon', type:'instant', minLevel:3,
    variableSpec:{
      sprints:{type:'numberRange', scale(L){return L<6?[2,4]:[3,5];}, step:1},
      base:{type:'numberRange', scale(L){return L<6?[1,2]:[2,3];}, step:1}
    },
    grammar:{
      names:['Intervaltur: {sprints} spurter + {base} km base','Interval: {sprints} × spurter','Spurtrute ({sprints} + {base} km)'],
      descs:['Gennemfør {sprints} spurter og en base på {base} km.','Kombinér {sprints} spurter med base {base} km.','Afslut {sprints} spurter + {base} km.']
    },
    signature(v){return `wi_${v.sprints}_${v.base}`;},
    reward(v){return 18+v.sprints*6+v.base*4;}
  },
  {
    id:'walk_multi_day', archetype:'horisontløber', rarity:'uncommon', type:'progress', minLevel:3, goalKey:'distance',
    variableSpec:{
      distance:{type:'numberRange', scale(L){return L<5?[18,32]:[28,55];}, step:2},
      days:{type:'numberRange', scale(L){return L<6?[3,5]:[4,6];}, step:1}
    },
    grammar:{
      names:['Gå {distance} km på {days} dage','Langtur {distance} km / {days} dage','Distanceudfordring {distance} / {days}'],
      descs:['Fordél {distance} km over {days} dage.','Samlet {distance} km inden {days} dage.','Planlæg stræk: {distance} km på {days} dage.']
    },
    signature(v){return `wmd_${v.distance}_${v.days}`;},
    reward(v){return 22+Math.round(v.distance*0.9);},
    durationClass:'long'
  },
  {
    id:'dawn_route', archetype:'horisontløber', rarity:'rare', type:'instant', minLevel:5,
    variableSpec:{ distance:{type:'numberRange', scale(L){return L<7?[4,8]:[6,12];}, step:2}},
    grammar:{
      names:['Daggryspor – {distance} km','Daggrytur {distance} km','Morgenlys {distance} km'],
      descs:['Gå {distance} km ved daggry.','Før solen står højt: {distance} km.','Udnyt morgenkulde: {distance} km.']
    },
    signature(v){return `dr_${v.distance}`;},
    reward(v){return 30+v.distance*3;}
  },
  {
    id:'scout_landmark', archetype:'horisontløber', rarity:'uncommon', type:'instant', minLevel:2,
    variableSpec:{ landmark:{type:'pickList', values(){return ['gammel eg','forvitret sten','forladt vogn','skjult lysning','mosgroet bro','blæst sti'];}, picks:1}},
    grammar:{
      names:['Spejd {landmark}','Opspor {landmark}','Find {landmark}'],
      descs:['Lokaliser {landmark} og observer detaljer.','Find {landmark} og vend tilbage.','Registrér placering af {landmark}.']
    },
    signature(v){return `sl_${v.landmark}`;},
    reward(){return 20;}
  },
  {
    id:'compass_run', archetype:'horisontløber', rarity:'common', type:'instant', minLevel:4,
    variableSpec:{ bearings:{type:'numberRange', scale(L){return L<7?[3,5]:[4,7];}, step:1}},
    grammar:{
      names:['Kompasrute ({bearings} retninger)','Skift retning {bearings} gange','Orienteringsloop {bearings}'],
      descs:['Løb/gå en kort sektion i {bearings} forskellige retninger.','Planlæg {bearings} retningsskift og udfør.','Udfør {bearings} orienteringsskift.']
    },
    signature(v){return `cr_${v.bearings}`;},
    reward(v){return 16+v.bearings*5;}
  },
  {
    id:'elevation_gain', archetype:'horisontløber', rarity:'uncommon', type:'progress', minLevel:5, goalKey:'stigninger',
    variableSpec:{ stigninger:{type:'numberRange', scale(L){return L<7?[6,10]:[9,14];}, step:1}},
    grammar:{
      names:['Samle {stigninger} bakke-stigninger','Bakkejagt: {stigninger}','Hæv pulsen: {stigninger} stigninger'],
      descs:['Gennemfør {stigninger} separate bakke-stigninger.','Find flere bakker – nå {stigninger}.','Fullfør {stigninger} opstigninger.']
    },
    signature(v){return `eg_${v.stigninger}`;},
    reward(v){return 32+v.stigninger*3;},
    durationClass:'medium'
  },
  {
    id:'steady_pace', archetype:'horisontløber', rarity:'common', type:'instant', minLevel:2,
    variableSpec:{ minutes:{type:'numberRange', scale(L){return L<5?[15,30]:[25,45];}, step:5}},
    grammar:{
      names:['Stabil tempo – {minutes} min','Jævn rute {minutes} min','Kontinuerlig bevægelse {minutes}'],
      descs:['Hold et jævnt tempo i {minutes} minutter.','Undgå stop i {minutes} minutter.','Sikr stabil rytme i {minutes} min.']
    },
    signature(v){return `sp_${v.minutes}`;},
    reward(v){return 10+v.minutes*0.7;}
  },
  {
    id:'evening_calm', archetype:'horisontløber', rarity:'common', type:'instant', minLevel:1,
    variableSpec:{ distance:{type:'numberRange', scale(L){return L<4?[1,3]:[2,4];}, step:1}},
    grammar:{
      names:['Aftenrunde {distance} km','Skumringstur {distance} km','Ro-løb {distance} km'],
      descs:['Gå eller lunt {distance} km ved skumring.','Afslut dagen med {distance} km rolig tur.','Rolig aftenbevægelse: {distance} km.']
    },
    signature(v){return `ec_${v.distance}`;},
    reward(v){return 6+v.distance*2;}
  },
  {
    id:'trail_mapping', archetype:'horisontløber', rarity:'epic', type:'progress', minLevel:7, goalKey:'segmenter',
    variableSpec:{ segmenter:{type:'numberRange', scale(){return [5,7];}, step:1}},
    grammar:{
      names:['Kortlæg {segmenter} nye stisegmenter','Stikortlægning {segmenter}','Trailmapping: {segmenter} segmenter'],
      descs:['Identificér og gennemfør {segmenter} nye stisegmenter.','Dokumentér {segmenter} segmenter (mental kort).','Skab rute af {segmenter} segmenter.']
    },
    signature(v){return `tm_${v.segmenter}`;},
    reward(v){return 90+v.segmenter*15;},
    durationClass:'long'
  }
];

const taagevogterFamilies = [
  {
    id:'herb_single', archetype:'tågevogter', rarity:'common', type:'instant', minLevel:1,
    variableSpec:{ plante:{type:'pickList', values(){return ['sjælden blomst','urt','mystisk svamp','duftende blad','klar krystal','grøn kapsel'];}, picks:1}},
    grammar:{
      names:['Find en {plante}','Opsamle {plante}','Udpeg {plante}'],
      descs:['Lokaliser og indsamle en {plante}.','Søg og find en {plante}.','Observer og tag en {plante}.']
    },
    signature(v){return `hs_${v.plante}`;},
    reward(){return 6;}
  },
  {
    id:'herb_batch', archetype:'tågevogter', rarity:'uncommon', type:'progress', minLevel:3, goalKey:'antal',
    variableSpec:{ antal:{type:'numberRange', scale(L){return L<5?[5,9]:[8,14];}, step:1}},
    grammar:{
      names:['Saml {antal} urter','Urteindsamling: {antal}','Botanisk høst {antal}'],
      descs:['Høst systematisk {antal} urter.','Registrér {antal} urtefund.','Indsaml {antal} sorter.']
    },
    signature(v){return `hb_${v.antal}`;},
    reward(v){return 14+v.antal*2;},
    durationClass:'medium'
  },
  {
    id:'dew_collection', archetype:'tågevogter', rarity:'uncommon', type:'instant', minLevel:2,
    variableSpec:{ dråber:{type:'numberRange', scale(L){return L<5?[10,20]:[18,30];}, step:2}},
    grammar:{
      names:['Indsamle {dråber} dugdråber','Dugfang: {dråber}','Dugritual ({dråber})'],
      descs:['Fang {dråber} dugdråber fra planter.','Opsamle {dråber} dugdråber forsigtigt.','Saml {dråber} dugdråber i en lille skål.']
    },
    signature(v){return `dc_${v.dråber}`;},
    reward(v){return 12+v.dråber*0.7;}
  },
  {
    id:'soil_samples', archetype:'tågevogter', rarity:'uncommon', type:'progress', minLevel:4, goalKey:'prøver',
    variableSpec:{ prøver:{type:'numberRange', scale(L){return L<6?[3,5]:[4,6];}, step:1}},
    grammar:{
      names:['Jordprøver: {prøver}','Tag {prøver} jordprøver','Analyser {prøver} jordtyper'],
      descs:['Udtag {prøver} jordprøver fra forskellige pletter.','Indsaml {prøver} distinkte jordtyper.','Kortlæg {prøver} prøver.']
    },
    signature(v){return `ss_${v.prøver}`;},
    reward(v){return 24+v.prøver*6;},
    durationClass:'medium'
  },
  {
    id:'seed_sort', archetype:'tågevogter', rarity:'common', type:'instant', minLevel:2,
    variableSpec:{ sorter:{type:'numberRange', scale(L){return L<5?[3,6]:[5,8];}, step:1}},
    grammar:{
      names:['Sorter {sorter} frøtyper','Frøkatalog: {sorter}','Udvælg {sorter} frøtyper'],
      descs:['Udvælg og adskil {sorter} frøtyper.','Klassificér {sorter} forskellige frø.','Sortér {sorter} typer i beholdere.']
    },
    signature(v){return `ssr_${v.sorter}`;},
    reward(v){return 8+v.sorter*3;}
  },
  {
    id:'leaf_press', archetype:'tågevogter', rarity:'common', type:'instant', minLevel:1,
    variableSpec:{ blade:{type:'numberRange', scale(L){return L<4?[2,4]:[3,6];}, step:1}},
    grammar:{
      names:['Pres {blade} blade','Bladpres: {blade}','Herbarium: {blade} blade'],
      descs:['Pres og fladgør {blade} forskellige blade.','Tilføj {blade} blade til herbariet.','Forbered {blade} blade til arkivering.']
    },
    signature(v){return `lp_${v.blade}`;},
    reward(v){return 5+v.blade*4;}
  },
  {
    id:'fungi_log', archetype:'tågevogter', rarity:'uncommon', type:'instant', minLevel:3,
    variableSpec:{ arter:{type:'numberRange', scale(L){return L<6?[2,4]:[3,5];}, step:1}},
    grammar:{
      names:['Notér {arter} svampearter','Svampelog: {arter}','Registrér {arter} svampe'],
      descs:['Find og notér {arter} arter.','Dokumentér {arter} svampefund.','Identificér {arter} distinkte svampe.']
    },
    signature(v){return `fl_${v.arter}`;},
    reward(v){return 18+v.arter*5;}
  },
  {
    id:'mist_watch', archetype:'tågevogter', rarity:'rare', type:'instant', minLevel:5,
    variableSpec:{ minutter:{type:'numberRange', scale(L){return L<7?[10,20]:[15,25];}, step:5}},
    grammar:{
      names:['Tågeobservation {minutter} min','Dug/tåge studie {minutter}','Fugtstudie {minutter} min'],
      descs:['Observer tågens form i {minutter} min.','Fokusér på skift i tåge {minutter} min.','Kortlæg bevægelse i {minutter} minutter.']
    },
    signature(v){return `mw_${v.minutter}`;},
    reward(v){return 30+v.minutter*2;}
  },
  {
    id:'essence_extract', archetype:'tågevogter', rarity:'rare', type:'progress', minLevel:6, goalKey:'ekstrakter',
    variableSpec:{ ekstrakter:{type:'numberRange', scale(){return [3,5];}, step:1}},
    grammar:{
      names:['Udtræk {ekstrakter} essenser','Essenslaboratorium {ekstrakter}','Destillér {ekstrakter} essenser'],
      descs:['Udtræk {ekstrakter} planteessenser.','Destillér {ekstrakter} unikke essenser.','Frembring {ekstrakter} essenser (renhed).']
    },
    signature(v){return `ee_${v.ekstrakter}`;},
    reward(v){return 60+v.ekstrakter*18;},
    durationClass:'long'
  },
  {
    id:'grove_alignment', archetype:'tågevogter', rarity:'epic', type:'progress', minLevel:7, goalKey:'trin',
    variableSpec:{ trin:{type:'numberRange', scale(){return [4,6];}, step:1}},
    grammar:{
      names:['Lundens afstemning ({trin} trin)','Grove-ritual {trin}','Stem lund: {trin} faser'],
      descs:['Udfør {trin} sekventielle naturfaser.','Balancer lunden gennem {trin} trin.','Afslut {trin} naturfaser i orden.']
    },
    signature(v){return `ga_${v.trin}`;},
    reward(v){return 90+v.trin*20;},
    durationClass:'long'
  }
];

const sagnsmedFamilies = [
  {
    id:'polish_armor', archetype:'sagnsmed', rarity:'common', type:'instant', minLevel:1,
    variableSpec:{ dele:{type:'numberRange', scale(L){return L<4?[1,3]:[2,4];}, step:1}},
    grammar:{
      names:['Puds {dele} rustningsdele','Polér {dele} dele','Vedligehold {dele} rustningsdele'],
      descs:['Rens og polér {dele} stykker rustning.','Gør {dele} dele funklende.','Vedligehold {dele} dele systematisk.']
    },
    signature(v){return `pa_${v.dele}`;},
    reward(v){return 6+v.dele*4;}
  },
  {
    id:'sharpen_blades', archetype:'sagnsmed', rarity:'common', type:'instant', minLevel:2,
    variableSpec:{ blade:{type:'numberRange', scale(L){return L<5?[1,3]:[2,5];}, step:1}},
    grammar:{
      names:['Slib {blade} klinger','Klingeslibning: {blade}','Skærp {blade} våben'],
      descs:['Slib {blade} klinger til klar kant.','Giv {blade} klinger frisk skarphed.','Sikre {blade} våben er skarpe.']
    },
    signature(v){return `sb_${v.blade}`;},
    reward(v){return 10+v.blade*5;}
  },
  {
    id:'repair_links', archetype:'sagnsmed', rarity:'uncommon', type:'progress', minLevel:3, goalKey:'led',
    variableSpec:{ led:{type:'numberRange', scale(L){return L<6?[12,20]:[18,28];}, step:2}},
    grammar:{
      names:['Reparer {led} ringled','Kædearbejde {led}','Fix {led} rustningsled'],
      descs:['Udskift eller ret {led} ringe.','Gendan {led} beskadigede led.','Sikre {led} ringe er intakte.']
    },
    signature(v){return `rl_${v.led}`;},
    reward(v){return 24+v.led*1.2;},
    durationClass:'medium'
  },
  {
    id:'forge_rivets', archetype:'sagnsmed', rarity:'common', type:'instant', minLevel:2,
    variableSpec:{ n:{type:'numberRange', scale(L){return L<5?[6,12]:[10,18];}, step:2}},
    grammar:{
      names:['Smed {n} nitter','Form {n} nitter','Nitteproduktion {n}'],
      descs:['Smed {n} funktionelle nitter.','Form og afkøl {n} nitter.','Producer {n} holdbare nitter.']
    },
    signature(v){return `fr_${v.n}`;},
    reward(v){return 8+v.n*1.3;}
  },
  {
    id:'temper_blade', archetype:'sagnsmed', rarity:'uncommon', type:'instant', minLevel:4,
    variableSpec:{ cyklus:{type:'numberRange', scale(L){return L<7?[2,3]:[3,4];}, step:1}},
    grammar:{
      names:['Hærd cyklus {cyklus}','Temperering {cyklus} trin','Blad-hærdning {cyklus}'],
      descs:['Gennemfør hærdning i {cyklus} varm/kold cyklusser.','Kontroller {cyklus} tempereringstrin.','Afslut {cyklus} hærdningsfaser.']
    },
    signature(v){return `tb_${v.cyklus}`;},
    reward(v){return 30+v.cyklus*12;}
  },
  {
    id:'engrave_symbol', archetype:'sagnsmed', rarity:'uncommon', type:'instant', minLevel:3,
    variableSpec:{ symbol:{type:'pickList', values(){return ['sol','måne','falk','løve','knude','stjerne'];}, picks:1}},
    grammar:{
      names:['Indgravér {symbol}','Symbolgravering: {symbol}','Marker {symbol}'],
      descs:['Indgravér et {symbol}-motiv i metal.','Føj {symbol} indgravering til en plade.','Præg et {symbol} tegn.']
    },
    signature(v){return `es_${v.symbol}`;},
    reward(){return 22;}
  },
  {
    id:'assemble_guard', archetype:'sagnsmed', rarity:'rare', type:'progress', minLevel:6, goalKey:'sektioner',
    variableSpec:{ sektioner:{type:'numberRange', scale(){return [3,5];}, step:1}},
    grammar:{
      names:['Samle hjalt ({sektioner} sektioner)','Hjaltmontage {sektioner}','Sværdhåndtag {sektioner} dele'],
      descs:['Saml {sektioner} sektioner til et færdigt greb.','Align og fastgør {sektioner} sektioner.','Fullfør greb af {sektioner} dele.']
    },
    signature(v){return `ag_${v.sektioner}`;},
    reward(v){return 55+v.sektioner*18;},
    durationClass:'long'
  },
  {
    id:'oil_preserve', archetype:'sagnsmed', rarity:'common', type:'instant', minLevel:1,
    variableSpec:{ dele:{type:'numberRange', scale(L){return L<4?[2,4]:[3,6];}, step:1}},
    grammar:{
      names:['Olier {dele} metaldele','Konserver {dele} dele','Smør {dele} stålflader'],
      descs:['Påfør olie på {dele} dele.','Konserver {dele} metalflader.','Smør {dele} stålkomponenter.']
    },
    signature(v){return `op_${v.dele}`;},
    reward(v){return 5+v.dele*3;}
  },
  {
    id:'balance_edge', archetype:'sagnsmed', rarity:'uncommon', type:'instant', minLevel:5,
    variableSpec:{ mm:{type:'numberRange', scale(L){return L<7?[2,4]:[3,6];}, step:1}},
    grammar:{
      names:['Balancer egde ({mm} mm)','Finjustér kant {mm} mm','Kantjustering {mm}'],
      descs:['Fjern ujævnhed (±{mm} mm tolerance).','Justér kant til ±{mm} mm.','Opnå jævnheder under {mm} mm.']
    },
    signature(v){return `be_${v.mm}`;},
    reward(v){return 26+v.mm*5;}
  },
  {
    id:'mythic_set', archetype:'sagnsmed', rarity:'epic', type:'progress', minLevel:7, goalKey:'dele',
    variableSpec:{ dele:{type:'numberRange', scale(){return [4,6];}, step:1}},
    grammar:{
      names:['Skab mytisk sæt ({dele} dele)','Legendarisk sæt {dele}','Fuldend sæt: {dele} komponenter'],
      descs:['Færdiggør {dele} til et samlet sæt.','Producer {dele} matcher.','Kompletér {dele} dele mytisk serie.']
    },
    signature(v){return `ms_${v.dele}`;},
    reward(v){return 95+v.dele*22;},
    durationClass:'long'
  }
];

const nattesoegerFamilies = [
  {
    id:'owl_listen', archetype:'nattesøger', rarity:'common', type:'instant', minLevel:1,
    variableSpec:{ minutter:{type:'numberRange', scale(L){return L<4?[5,12]:[10,18];}, step:1}},
    grammar:{
      names:['Natlyt {minutter} min','Uglelyt {minutter} min','Stilhedslyt {minutter}'],
      descs:['Lyt fokuseret i {minutter} min.','Opfang natlyde {minutter} min.','Observer mørkets lyde {minutter} min.']
    },
    signature(v){return `ol_${v.minutter}`;},
    reward(v){return 6+v.minutter*1.2;}
  },
  {
    id:'star_notes', archetype:'nattesøger', rarity:'common', type:'instant', minLevel:2,
    variableSpec:{ stjerner:{type:'numberRange', scale(L){return L<5?[3,6]:[5,9];}, step:1}},
    grammar:{
      names:['Notér {stjerner} stjerner','Stjernekort {stjerner}','Skitsér {stjerner} stjerner'],
      descs:['Skitsér {stjerner} markante stjerner.','Notér {stjerner} lysprikker.','Kortlæg {stjerner} punkter.']
    },
    signature(v){return `sn_${v.stjerner}`;},
    reward(v){return 8+v.stjerner*2;}
  },
  {
    id:'moon_phase', archetype:'nattesøger', rarity:'uncommon', type:'instant', minLevel:3,
    variableSpec:{ faser:{type:'numberRange', scale(L){return L<6?[1,2]:[2,3];}, step:1}},
    grammar:{
      names:['Registrér {faser} månefaser','Månefasejournal {faser}','Måneobservation {faser}'],
      descs:['Beskriv {faser} aktuelle månefaser.','Notér ændringer i {faser} faser.','Journalfør {faser} måneudtryk.']
    },
    signature(v){return `mp_${v.faser}`;},
    reward(v){return 18+v.faser*10;}
  },
  {
    id:'night_walk', archetype:'nattesøger', rarity:'common', type:'instant', minLevel:1,
    variableSpec:{ minutter:{type:'numberRange', scale(L){return L<4?[10,20]:[15,30];}, step:5}},
    grammar:{
      names:['Natvandring {minutter} min','Skumringsgang {minutter}','Mørketur {minutter} min'],
      descs:['Gå i mørke {minutter} min.','Tilbring {minutter} min i dæmpet lys.','Færdiggør {minutter} min natlig vandring.']
    },
    signature(v){return `nw_${v.minutter}`;},
    reward(v){return 10+v.minutter*0.8;}
  },
  {
    id:'shadow_mapping', archetype:'nattesøger', rarity:'uncommon', type:'instant', minLevel:4,
    variableSpec:{ punkter:{type:'numberRange', scale(L){return L<7?[3,5]:[4,6];}, step:1}},
    grammar:{
      names:['Skyggekort {punkter} punkter','Kortlæg skygger ({punkter})','Skuggemapping {punkter}'],
      descs:['Identificér {punkter} mørke punkter.','Marker {punkter} skyggeområder.','Kortlæg {punkter} steder med kontrast.']
    },
    signature(v){return `sm_${v.punkter}`;},
    reward(v){return 24+v.punkter*6;}
  },
  {
    id:'night_chants', archetype:'nattesøger', rarity:'uncommon', type:'progress', minLevel:5, goalKey:'sessioner',
    variableSpec:{ sessioner:{type:'numberRange', scale(L){return L<7?[3,5]:[4,6];}, step:1}},
    grammar:{
      names:['Aftenritual {sessioner} sessioner','Natkald {sessioner}','Chantcyklus {sessioner}'],
      descs:['Udfør {sessioner} korte chant-sessioner.','Afslut {sessioner} aftenritualer.','Hold {sessioner} chant-cyklusser.']
    },
    signature(v){return `nc_${v.sessioner}`;},
    reward(v){return 40+v.sessioner*10;},
    durationClass:'medium'
  },
  {
    id:'silence_log', archetype:'nattesøger', rarity:'common', type:'instant', minLevel:2,
    variableSpec:{ minutter:{type:'numberRange', scale(L){return L<5?[5,12]:[10,18];}, step:1}},
    grammar:{
      names:['Stillhedslog {minutter} min','Stilhedsobservation {minutter}','Tavshedsregistrering {minutter}'],
      descs:['Sæt dig i stilhed {minutter} min.','Oplev {minutter} min uforstyrret stilhed.','Registrér indtryk efter {minutter} min tavshed.']
    },
    signature(v){return `slg_${v.minutter}`;},
    reward(v){return 9+v.minutter*1.1;}
  },
  {
    id:'constellation_trace', archetype:'nattesøger', rarity:'rare', type:'instant', minLevel:6,
    variableSpec:{ figurer:{type:'numberRange', scale(L){return L<8?[2,3]:[3,4];}, step:1}},
    grammar:{
      names:['Opspor {figurer} stjernebilleder','Trace {figurer} konstellationer','Stjernemønster {figurer}'],
      descs:['Identificér {figurer} tydelige konstellationer.','Pege og beskrive {figurer} mønstre.','Gendan {figurer} stjernebilleder.']
    },
    signature(v){return `ct_${v.figurer}`;},
    reward(v){return 34+v.figurer*14;}
  },
  {
    id:'nocturnal_journal', archetype:'nattesøger', rarity:'common', type:'instant', minLevel:3,
    variableSpec:{ ord:{type:'numberRange', scale(L){return L<6?[50,90]:[80,130];}, step:10}},
    grammar:{
      names:['Natjournal {ord} ord','Natskrift {ord} ord','Mørkets noter {ord}'],
      descs:['Skriv {ord} ord efter mørkets indtryk.','Samle {ord} ord natindtryk.','Formuler {ord} ord erfaringer.']
    },
    signature(v){return `nj_${v.ord}`;},
    reward(v){return 12+v.ord*0.45;}
  },
  {
    id:'astral_alignment', archetype:'nattesøger', rarity:'epic', type:'progress', minLevel:7, goalKey:'trin',
    variableSpec:{ trin:{type:'numberRange', scale(){return [4,6];}, step:1}},
    grammar:{
      names:['Astral afstemning {trin} trin','Stjerneritual {trin}','Kosmisk sekvens {trin}'],
      descs:['Udfør {trin} sekventielle astrale trin.','Afslut {trin} fokuserede stjernetrin.','Gennemfør {trin} kosmiske faser.']
    },
    signature(v){return `aa_${v.trin}`;},
    reward(v){return 95+v.trin*20;},
    durationClass:'long'
  }
];

const traadmesterFamilies = [
  {
    id:'greeting_thread', archetype:'trådmester', rarity:'common', type:'instant', minLevel:1,
    variableSpec:{ personer:{type:'numberRange', scale(L){return L<4?[1,2]:[2,3];}, step:1}},
    grammar:{
      names:['Skab kontakt til {personer} gæster','Hilse på {personer} nye','Første bånd {personer}'],
      descs:['Start samtale med {personer} nye gæster.','Hils og udveksl ord med {personer}.','Skab venlig kontakt til {personer}.']
    },
    signature(v){return `gt_${v.personer}`;},
    reward(v){return 6+v.personer*5;}
  },
  {
    id:'story_exchange', archetype:'trådmester', rarity:'common', type:'instant', minLevel:2,
    variableSpec:{ historier:{type:'numberRange', scale(L){return L<5?[1,2]:[2,3];}, step:1}},
    grammar:{
      names:['Udveksl {historier} historier','Fortællingsskift {historier}','Del {historier} korte historier'],
      descs:['Del og modtag {historier} historier.','Byt {historier} fortællinger.','Engager i {historier} historier.']
    },
    signature(v){return `se_${v.historier}`;},
    reward(v){return 10+v.historier*8;}
  },
  {
    id:'mediate', archetype:'trådmester', rarity:'uncommon', type:'instant', minLevel:3,
    variableSpec:{ minutter:{type:'numberRange', scale(L){return L<6?[5,10]:[8,14];}, step:1}},
    grammar:{
      names:['Mægling {minutter} min','Afklaringsrunde {minutter}','Balancer samtale {minutter}'],
      descs:['Facilitér rolig dialog {minutter} min.','Mæg konflikt i {minutter} min.','Guide samtale {minutter} min.']
    },
    signature(v){return `md_${v.minutter}`;},
    reward(v){return 20+v.minutter*2;}
  },
  {
    id:'laughter_chain', archetype:'trådmester', rarity:'common', type:'instant', minLevel:1,
    variableSpec:{ personer:{type:'numberRange', scale(L){return L<5?[2,4]:[3,6];}, step:1}},
    grammar:{
      names:['Få {personer} til at le','Latterkæde {personer}','Fælles grin {personer}'],
      descs:['Starter grin hos {personer} personer.','Skab smil hos {personer}.','Udløs latterkæde med {personer}.']
    },
    signature(v){return `lc_${v.personer}`;},
    reward(v){return 8+v.personer*4;}
  },
  {
    id:'small_circle', archetype:'trådmester', rarity:'uncommon', type:'progress', minLevel:4, goalKey:'sessioner',
    variableSpec:{ sessioner:{type:'numberRange', scale(L){return L<7?[2,3]:[3,4];}, step:1}},
    grammar:{
      names:['Hold {sessioner} cirkelsessioner','Samtalecirkel {sessioner}','Fællesrunde {sessioner}'],
      descs:['Moderér {sessioner} små samtalesessioner.','Afhold {sessioner} cirkler.','Sørg for {sessioner} fokuserede rundesamtaler.']
    },
    signature(v){return `scir_${v.sessioner}`;},
    reward(v){return 32+v.sessioner*12;},
    durationClass:'medium'
  },
  {
    id:'introduce_pairs', archetype:'trådmester', rarity:'uncommon', type:'instant', minLevel:3,
    variableSpec:{ par:{type:'numberRange', scale(L){return L<6?[1,2]:[2,3];}, step:1}},
    grammar:{
      names:['Introducér {par} par','Skab {par} forbindelser','Parintroduktion {par}'],
      descs:['Introducér {par} sæt personer.','Frem hjælp til {par} nye forbindelser.','Etabler {par} par relationer.']
    },
    signature(v){return `ip_${v.par}`;},
    reward(v){return 18+v.par*10;}
  },
  {
    id:'gesture_observe', archetype:'trådmester', rarity:'common', type:'instant', minLevel:2,
    variableSpec:{ observationer:{type:'numberRange', scale(L){return L<5?[3,5]:[4,7];}, step:1}},
    grammar:{
      names:['Observer {observationer} gestus','Gestuslog {observationer}','Nonverbal note {observationer}'],
      descs:['Notér {observationer} tydelige gestus.','Registrér {observationer} nonverbale tegn.','Log {observationer} kropslige markører.']
    },
    signature(v){return `go_${v.observationer}`;},
    reward(v){return 9+v.observationer*3;}
  },
  {
    id:'evening_host', archetype:'trådmester', rarity:'rare', type:'progress', minLevel:6, goalKey:'interaktioner',
    variableSpec:{ interaktioner:{type:'numberRange', scale(){return [6,10];}, step:1}},
    grammar:{
      names:['Vært for {interaktioner} interaktioner','Aftenvært {interaktioner}','Koordinér {interaktioner} møder'],
      descs:['Før {interaktioner} meningsfulde interaktioner.','Sørg for {interaktioner} engagerende møder.','Afvikl {interaktioner} værtsinteraktioner.']
    },
    signature(v){return `eh_${v.interaktioner}`;},
    reward(v){return 60+v.interaktioner*10;},
    durationClass:'long'
  },
  {
    id:'shared_memory', archetype:'trådmester', rarity:'uncommon', type:'instant', minLevel:4,
    variableSpec:{ personer:{type:'numberRange', scale(L){return L<7?[2,3]:[3,4];}, step:1}},
    grammar:{
      names:['Fælles minde med {personer}','Delt øjeblik {personer}','Skab fælles reference {personer}'],
      descs:['Skab et fælles minde med {personer} personer.','Fremkald og del et minde med {personer}.','Initier fælles oplevelse {personer}.']
    },
    signature(v){return `smem_${v.personer}`;},
    reward(v){return 24+v.personer*8;}
  },
  {
    id:'grand_gather', archetype:'trådmester', rarity:'epic', type:'progress', minLevel:7, goalKey:'trin',
    variableSpec:{ trin:{type:'numberRange', scale(){return [4,6];}, step:1}},
    grammar:{
      names:['Stor samling ({trin} trin)','Storsamling {trin}','Koordineret møde {trin} faser'],
      descs:['Planlæg {trin} sekvenser for større samling.','Udfør {trin} faser koordinering.','Fuldfør {trin} trin for samlet hændelse.']
    },
    signature(v){return `gg_${v.trin}`;},
    reward(v){return 95+v.trin*20;},
    durationClass:'long'
  }
];

// Samlet pool
const families = [
  ...skyggeskriverFamilies,
  ...horisontloeberFamilies,
  ...taagevogterFamilies,
  ...sagnsmedFamilies,
  ...nattesoegerFamilies,
  ...traadmesterFamilies
];

// Core filtering
function filterFamilies(playerLevel, archetypeLevels, desiredType){
  return families.filter(f=>{
    if(desiredType && f.type!==desiredType) return false;
    if(f.minLevel && playerLevel < f.minLevel) return false;
    if(f.maxLevel && playerLevel > f.maxLevel) return false;
    if(f.minArchetypeLevel){
      const al=archetypeLevels?.[f.archetype]||1;
      if(al < f.minArchetypeLevel) return false;
    }
    return true;
  });
}

function selectFamily(cands, playerLevel, currentProgressCount){
  if(!cands.length) return null;
  const rw = rarityWeightsForLevel(playerLevel);
  const weights = cands.map(f=>{
    let w = rw[f.rarity]||0.01;
    // straff repeat familie
    const recentCount = recentSignatures.filter(s=>s.startsWith(f.id+'_')).length;
    if(recentCount>3) w*=0.5;
    if(f.type==='progress' && currentProgressCount>=maxProgressAllowed(playerLevel)) w*=0.12;
    return w;
  });
  return weightedSelect(cands, weights);
}

function generateFamilyQuest({playerLevel=1, archetypeLevels={}, type=null, currentProgressCount=0}={}){
  const cands = filterFamilies(playerLevel, archetypeLevels, type);
  if(!cands.length) return null;
  for(let i=0;i<40;i++){
    const fam = selectFamily(cands, playerLevel, currentProgressCount);
    if(!fam) break;
    const vars = genVars(fam, playerLevel);
    const sig = (fam.signature?fam.signature(vars):fam.id+'::'+JSON.stringify(vars));
    if(sigRecent(sig)) continue;
    const q=buildQuest(fam, vars, playerLevel, archetypeLevels);
    registerSignature(sig);
    return q;
  }
  return null;
}

// Legacy fallback (bevarer oprindeligt minimum hvis alt fejler)
const legacyTemplates = [
  { archetype:'horisontløber', type:'instant', level:1, xp:5, name:'Gå en tur på {distance} km', desc:'Gå {distance} km i {område}.', variables:{distance:[1,2,3,5], område:['skoven','markerne','langs floden']} },
  { archetype:'tågevogter', type:'instant', level:1, xp:5, name:'Find en {plante}', desc:'Udforsk haven og find en {plante}.', variables:{plante:['sjælden blomst','urt','mystisk svamp']} },
  { archetype:'skyggeskriver', type:'instant', level:1, xp:5, name:'Læs {pages} sider i {book}', desc:'Læs {pages} sider i {book}.', variables:{pages:[5,10,15,20], book:['Den gamle krønike','Eryndors Saga','Mørkets Hemmeligheder']} }
];
function legacyQuest(){
  const t=pick(legacyTemplates);
  let name=t.name, desc=t.desc, vars={};
  for(const k in t.variables){
    const val=pick(t.variables[k]);
    name=name.replace(`{${k}}`,val);
    desc=desc.replace(`{${k}}`,val);
    vars[k]=val;
  }
  const arch=archetypes.find(a=>a.id===t.archetype);
  return {
    id: nextId(), archetype: arch.id, icon: arch.icon,
    name, desc, xp:t.xp, level:t.level, type:t.type,
    goal:null, vars, progress:null, completed:false,
    rarity:'legacy', signature:'legacy_'+name
  };
}

// Public API
export function generateRandomQuest(opts={}){
  const q = generateFamilyQuest(opts);
  if(q) return q;
  return legacyQuest();
}
export function generateQuestList(count=6, opts={}){
  const list=[];
  let progCount=opts.currentProgressCount || 0;
  for(let i=0;i<count;i++){
    const q=generateRandomQuest({...opts, currentProgressCount:progCount});
    list.push(q);
    if(q.type==='progress') progCount++;
  }
  return list;
}
export function updateQuestProgress(quest, amount){
  if(quest.type!=='progress') return;
  quest.progress += amount;
  const target = quest.vars[quest.goal];
  if(quest.progress >= target){
    quest.progress=target;
    quest.completed=true;
  }
}

// Dynamic registration (valgfrit)
export function registerQuestFamilies(extra=[]){
  extra.forEach(f=>{
    if(f?.id && f.archetype) families.push(f);
  });
}

// Debug (valgfrit)
if(typeof window!=='undefined'){
  window.__questFamilies=families;
  window.generateQuestDebug=(n=5,L=4)=>generateQuestList(n,{playerLevel:L});
}
