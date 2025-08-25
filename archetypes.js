// Central registry over arketyper – baseret på dine eksisterende enkeltfiler.
// Vi tilfører kun et 'id' her. Ingen ændring i de originale eksport-objekter.
import { skyggeskriveren } from './skyggeskriveren.js';
import { horisontlober } from './horisontlober.js';
import { taagevogter } from './taagevogter.js';
import { sagnsmed } from './sagnsmed.js';
import { tradmester } from './tradmester.js';

// Bevarer dine “visuelle” navne (med ø/å) i id'erne da dine quests sandsynligvis refererer sådan.
// Hvis du senere vil normalisere til ASCII, gør vi det samlet ét sted.
export const archetypes = [
  { id: 'skyggeskriver', ...skyggeskriveren },
  { id: 'horisontløber', ...horisontlober },
  { id: 'tågevogter', ...taagevogter },
  { id: 'sagnsmed', ...sagnsmed },
  { id: 'trådmester', ...tradmester }
  // 'nattesøger' mangler, fordi der endnu ikke findes en fil – tilføjes senere.
];

export const archetypeMap = Object.fromEntries(archetypes.map(a => [a.id, a]));

export function getArchetypeLore(id, level) {
  const a = archetypeMap[id];
  if (!a) return null;
  if (level == null) {
    // Finder level 1 lore som standard
    return a.levels?.find(l => l.level === 1) || null;
  }
  return a.levels?.find(l => l.level === level) || null;
}
// Central registry over arketyper – baseret på dine eksisterende enkeltfiler.
// (Eksisterende imports beholdes)
import { skyggeskriveren } from './skyggeskriveren.js';
import { horisontlober }    from './horisontlober.js';
import { taagevogter }      from './taagevogter.js';
import { sagnsmed }         from './sagnsmed.js';
import { tradmester }       from './tradmester.js';

// Normalisering til filnavn: æ→ae, ø→oe, å→aa + fjern diakritika + kun a-z0-9
function normalizeArchetypeIdForFilename(id){
  return id.toLowerCase()
    .replace(/æ/g,'ae').replace(/ø/g,'oe').replace(/å/g,'aa')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'')
    .trim();
}

// Eksplicit id-strenge (beholder diakritik i id – det bruger resten af koden)
export const archetypes = [
  { id: 'skyggeskriver', ...skyggeskriveren },
  { id: 'horisontløber', ...horisontlober },
  { id: 'tågevogter',    ...taagevogter },
  { id: 'sagnsmed',      ...sagnsmed },
  { id: 'trådmester',    ...tradmester }
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

// NY: Generér billedsti (liggende i repo-root)
export function getArchetypeImagePath(id){
  if(!id) return '';
  const base = normalizeArchetypeIdForFilename(id);
  return `${base}.png`; // Hvis du senere vil understøtte webp/jpg kan du udvide her.
}
