// Central registry over arketyper – uden at ændre de oprindelige filer.
import { skyggeskriveren } from './skyggeskriveren.js';
import { horisontlober } from './horisontlober.js';
import { taagevogter } from './taagevogter.js';
import { sagnsmed } from './sagnsmed.js';
import { tradmester } from './tradmester.js';

// Vi tilføjer kun id her, så de passer til de id'er du allerede brugte i app.js
// (bevarer diakritik for konsistens med quests: horisontløber, tågevogter, trådmester)
export const archetypes = [
  { id: 'skyggeskriver', ...skyggeskriveren },
  { id: 'horisontløber', ...horisontlober },
  { id: 'tågevogter', ...taagevogter },
  { id: 'sagnsmed', ...sagnsmed },
  { id: 'trådmester', ...tradmester }
];

export const archetypeMap = Object.fromEntries(archetypes.map(a => [a.id, a]));

// Valgfri hjælper – ikke påkrævet af app.js endnu
export function getArchetypeLore(id, level) {
  const a = archetypeMap[id];
  if (!a) return null;
  if (level == null) return a.levels?.[0] || null;
  return a.levels?.find(l => l.level === level) || null;
}