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
