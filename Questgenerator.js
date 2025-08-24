// Dynamisk quest-generator med vægtet sandsynlighed for niveau

const archetypes = [
  { id: "skyggeskriver", name: "Skyggeskriver", icon: "🧙‍♂️" },
  { id: "horisontløber", name: "Horisontløber", icon: "🏇" },
  { id: "tågevogter", name: "Tågevogter", icon: "🌿" },
  { id: "sagnsmed", name: "Sagnsmed", icon: "🛡️" },
  { id: "nattesøger", name: "Nattesøger", icon: "🦉" },
  { id: "trådmester", name: "Trådmester", icon: "🤹‍♂️" }
];

const questTemplates = [
  // INSTANT quests
  {
    archetype: "horisontløber",
    type: "instant",
    level: 1,
    xp: 5,
    name: "Gå en tur på {distance} km",
    desc: "Tag på eventyr og gå {distance} km i {område}.",
    variables: {
      distance: [1, 2, 3, 5],
      område: ["skoven", "markerne", "langs floden"]
    }
  },
  {
    archetype: "tågevogter",
    type: "instant",
    level: 1,
    xp: 5,
    name: "Find en {plante}",
    desc: "Udforsk haven og find en {plante}.",
    variables: {
      plante: ["sjælden blomst", "urt", "mystisk svamp"]
    }
  },
  {
    archetype: "skyggeskriver",
    type: "instant",
    level: 1,
    xp: 5,
    name: "Læs {pages} sider i {book}",
    desc: "Find {book} ved pejsen og læs {pages} sider.",
    variables: {
      pages: [5, 10, 15, 20],
      book: ["Den gamle krønike", "Eryndors Saga", "Mørkets Hemmeligheder"]
    }
  },
  {
    archetype: "trådmester",
    type: "instant",
    level: 1,
    xp: 5,
    name: "Skab et bånd med en gæst",
    desc: "Tal med én du ikke kender og bind venskabets tråd.",
    variables: {}
  },
  // LEVEL 2 quests (sjældnere)
  {
    archetype: "skyggeskriver",
    type: "progress",
    level: 2,
    xp: 30,
    name: "Læs {pages} sider på en uge",
    desc: "Læs samlet {pages} sider på 7 dage.",
    variables: {
      pages: [100, 200, 300]
    },
    goal: "pages"
  },
  // LEVEL 3 quests (mest sjældne)
  {
    archetype: "horisontløber",
    type: "progress",
    level: 3,
    xp: 50,
    name: "Gå {distance} km på {days} dage",
    desc: "Udfordring: Gå samlet {distance} km på {days} dage.",
    variables: {
      distance: [25, 50, 100],
      days: [3, 7, 14]
    },
    goal: "distance"
  }
  // Tilføj flere templates!
];

let questIdCounter = 1;
function makeQuestId() {
  return "gq" + (questIdCounter++);
}

// VÆGTET niveau-fordeling: level 1 = 70%, level 2 = 20%, level 3+ = 10%
function pickLevelWeighted() {
  const roll = Math.random();
  if (roll < 0.7) return 1;
  if (roll < 0.9) return 2;
  return 3;
}

export function generateRandomQuest({type=null, level=null} = {}) {
  let templates = questTemplates;
  // Hvis level ikke er angivet, vælg et niveau efter vægt:
  const chosenLevel = level || pickLevelWeighted();
  templates = templates.filter(t => t.level === chosenLevel);
  if (type) templates = templates.filter(t => t.type === type);
  // Hvis ingen match, vælg fra alle templates:
  if (templates.length === 0) templates = questTemplates;
  const template = templates[Math.floor(Math.random() * templates.length)];

  let name = template.name;
  let desc = template.desc;
  let questVars = {};
  for (const key in template.variables) {
    const vals = template.variables[key];
    const val = vals[Math.floor(Math.random() * vals.length)];
    name = name.replace(`{${key}}`, val);
    desc = desc.replace(`{${key}}`, val);
    questVars[key] = val;
  }

  const arch = archetypes.find(a => a.id === template.archetype);
  return {
    id: makeQuestId(),
    archetype: arch.id,
    icon: arch.icon,
    name,
    desc,
    xp: template.xp,
    level: template.level,
    type: template.type,
    goal: template.goal || null,
    vars: questVars,
    progress: template.type === "progress" ? 0 : null,
    completed: false
  };
}

export function generateQuestList(count = 6, opts = {}) {
  const quests = [];
  for (let i = 0; i < count; i++) {
    quests.push(generateRandomQuest(opts));
  }
  return quests;
}

export function updateQuestProgress(quest, amount) {
  if (quest.type !== "progress") return;
  quest.progress += amount;
  const goalVal = quest.vars[quest.goal];
  if (quest.progress >= goalVal) {
    quest.completed = true;
    quest.progress = goalVal;
  }
}