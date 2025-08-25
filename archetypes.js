// === Archetypes registry (ren version med billedsti) =======================
// Import af de eksisterende arketype-data (uændret struktur i enkeltfiler)
import { skyggeskriveren } from './skyggeskriveren.js';
import { horisontlober }   from './horisontlober.js';
import { taagevogter }     from './taagevogter.js';
import { sagnsmed }        from './sagnsmed.js';
import { tradmester }      from './tradmester.js';

/*
  Filnavn-normalisering til billeder:
  - Små bogstaver
  - æ -> ae
  - ø -> o
  - å -> a   (matcher dine eksisterende JS-filnavne: tradmester, horisontlober)
  - Fjern diakritik (sikkerhed)
  - Fjern alt der ikke er a-z0-9
  Eksempler:
    "trådmester"    -> "tradmester.png"
    "horisontløber" -> "horisontlober.png"
    "tågevogter"    -> "taagevogter.png" (fordi du selv bruger 'taagevogter.js')
*/
function normalizeForFilename(id){
  return id.toLowerCase()
    .replace(/æ/g,'ae')
    .replace(/ø/g,'o')
    .replace(/å/g,'a')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'')
    .trim();
}

// Returnerer sti til billedet (liggende i repo-roden)
export function getArchetypeImagePath(id){
  if(!id) return '';
  return `${normalizeForFilename(id)}.png`;
}

// Registrering – beholder diakritik i id (resten af app’en forventer det)
export const archetypes = [
  { id: 'skyggeskriver',  ...skyggeskriveren },
  { id: 'horisontløber',  ...horisontlober },
  { id: 'tågevogter',     ...taagevogter },
  { id: 'sagnsmed',       ...sagnsmed },
  { id: 'trådmester',     ...tradmester }
];

export const archetypeMap = Object.fromEntries(archetypes.map(a => [a.id, a]));

export function getArchetypeLore(id, level) {
  const a = archetypeMap[id];
  if (!a) return null;
  if (level == null) {
    return a.levels?.find(l => l.level === 1) || null;
  }
  return a.levels?.find(l => l.level === level) || null;
}
// ==========================================================================
