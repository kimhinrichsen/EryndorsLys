import { storyChapters } from './story.js';
import { generateQuestList, updateQuestProgress } from './Questgenerator.js';
import { archetypes as archetypesFromRegistry, archetypeMap, getArchetypeLore } from './archetypes.js';

// (Reference – ikke brugt funktionelt men bevaret)
const archetypesOriginal = [
  { id: "skyggeskriver", name: "Skyggeskriver", icon: "🧙‍♂️" },
  { id: "horisontløber", name: "Horisontløber", icon: "🏇" },
  { id: "tågevogter", name: "Tågevogter", icon: "🌿" },
  { id: "sagnsmed", name: "Sagnsmed", icon: "🛡️" },
  { id: "nattesøger", name: "Nattesøger", icon: "🦉" },
  { id: "trådmester", name: "Trådmester", icon: "🤹‍♂️" }
];

// Aktive arketyper med lore
const archetypes = archetypesFromRegistry;

// KONSTANTER
const levelEmblems = { 1: "🔸", 2: "✨", 3: "⭐", 4: "🌟", 5: "🌠" };
const MAX_QUESTS_ON_TAVLE = 6;
const XP_BASE = 50;
const XP_EXPONENT = 1.25;

// XP / LEVEL FUNKTIONER
function xpRequiredForLevel(level) { return Math.floor(XP_BASE * Math.pow(level, XP_EXPONENT)); }
function xpForLevel(level) { let xp = 0; for (let i = 1; i < level; i++) xp += xpRequiredForLevel(i); return xp; }
function calcLevel(xp, maxLevel = 100) { for (let l = 1; l < maxLevel; l++) { if (xp < xpForLevel(l + 1)) return l; } return maxLevel; }
function calcProgress(xp, maxLevel = 100) {
  const level = calcLevel(xp, maxLevel);
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return Math.min((xp - base) / (next - base), 1);
}
function getCurrentStoryChapter() { return calcLevel(state.xp) - 1; }

// STATE
const state = {
  currentView: 'main', // 'main' | 'chronicle'
  xp: 0,
  archetypeXP: Object.fromEntries(archetypes.map(a => [a.id, 0])),
  archetypeLevel: Object.fromEntries(archetypes.map(a => [a.id, 1])),
  active: [],
  completed: [], // hver quest: {id, name, xp, archetype, completedAt, type, levelRequirement, ...}
  tavleQuests: generateQuestList(MAX_QUESTS_ON_TAVLE),
  chronicleLore: [], // lore entries: {id, archetypeId, archetypeName, level, majorLore, minorLore, ts}
  achievementsUnlocked: new Set()
};

// DEBUG
window.state = state;
window.debugLevelUp = function (id, xpBoost = 60) {
  if (!(id in state.archetypeXP)) { console.warn("Ukendt arketype:", id); return; }
  const before = calcLevel(state.archetypeXP[id]);
  state.archetypeXP[id] += xpBoost;
  const after = calcLevel(state.archetypeXP[id]);
  for (let lvl = before + 1; lvl <= after; lvl++) unlockLore(id, lvl);
  state.archetypeLevel[id] = after;
  checkAchievements();
  renderProfile();
  if (state.currentView === 'chronicle') renderChronicleView();
};

// ACHIEVEMENTS DEFINITION
const achievementDefs = [
  {
    id: 'first_quest',
    title: 'Første Skridt',
    desc: 'Gennemfør 1 quest',
    check: () => state.completed.length >= 1
  },
  {
    id: 'ten_quests',
    title: 'Ti i Tasken',
    desc: 'Gennemfør 10 quests',
    check: () => state.completed.length >= 10
  },
  {
    id: 'total_xp_500',
    title: 'Stjernelys 500',
    desc: 'Opnå 500 samlet XP',
    check: () => state.xp >= 500
  },
  // Dynamiske pr. arketype (level 3)
  ...archetypes.map(a => ({
    id: `archetype_lvl_3_${a.id}`,
    title: `${a.name} III`,
    desc: `Nå level 3 med ${a.name}`,
    check: () => calcLevel(state.archetypeXP[a.id]) >= 3
  }))
];

function checkAchievements() {
  let newOnes = [];
  for (const def of achievementDefs) {
    if (!state.achievementsUnlocked.has(def.id) && def.check()) {
      state.achievementsUnlocked.add(def.id);
      newOnes.push(def);
    }
  }
  if (newOnes.length) {
    // (Valgfrit) kunne popup achievements – for nu bare console
    console.log("Nye achievements:", newOnes.map(a => a.id));
    if (state.currentView === 'chronicle') renderAchievementsSection(); // refresh
  }
}

// LORE UNLOCK
function unlockLore(archetypeId, level) {
  const lore = getArchetypeLore(archetypeId, level);
  if (!lore) return;
  const key = `${archetypeId}_${level}`;
  if (state.chronicleLore.some(e => e.id === key)) return;
  const a = archetypeMap[archetypeId];
  const entry = {
    id: key,
    archetypeId,
    archetypeName: a?.name || archetypeId,
    level,
    majorLore: lore.majorLore,
    minorLore: lore.minorLore || [],
    ts: Date.now()
  };
  state.chronicleLore.push(entry);
  showLorePopup(entry);
}

// LORE POPUP
function showLorePopup(entry) {
  if (state.currentView !== 'main') return; // kun på spil-forsiden
  const containerId = 'lore-popup-container';
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5000;';
    document.body.appendChild(container);
  }
  const wrap = document.createElement('div');
  wrap.style.cssText = `
    position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
    background:rgba(10,12,18,0.55);backdrop-filter:blur(3px);pointer-events:auto;
    animation:fadeIn .35s;z-index:5001;
  `;
  wrap.innerHTML = `
    <div style="
      background:#1d1f24;color:#eee;max-width:520px;width:clamp(300px,70%,520px);
      border:1px solid #444;border-radius:14px;padding:22px 26px;
      font:14px/1.45 system-ui, Arial, sans-serif; position:relative;
      box-shadow:0 8px 30px rgba(0,0,0,0.55);
      animation:scaleIn .35s;
    ">
      <button id="close-lore-popup" style="
        position:absolute;top:8px;right:10px;background:#333;color:#ccc;
        border:1px solid #555;border-radius:4px;cursor:pointer;padding:2px 6px;
      ">✖</button>
      <h2 style="margin:0 0 6px 0;font-size:19px;">
        ${entry.archetypeName} – Level ${entry.level}
      </h2>
      <p style="margin:0 0 12px 0;font-weight:600;">${entry.majorLore}</p>
      ${entry.minorLore.length
        ? `<ul style="margin:0 0 14px 18px;padding:0;">${entry.minorLore.map(m => `<li>${m}</li>`).join('')}</ul>`
        : ''
      }
      <div style="text-align:right;">
        <button id="open-chronicle" style="
          background:#2e4b7a;color:#fff;border:1px solid #476694;border-radius:5px;
          padding:6px 10px;cursor:pointer;font-size:13px;
        ">Åbn krøniken</button>
        <button id="dismiss-lore" style="
          background:#444;color:#eee;border:1px solid #666;border-radius:5px;
          padding:6px 10px;cursor:pointer;font-size:13px;margin-left:6px;
        ">Luk</button>
      </div>
    </div>
  `;
  container.appendChild(wrap);
  const close = () => { wrap.style.opacity = '0'; wrap.style.transition = 'opacity .25s'; setTimeout(()=>wrap.remove(), 250); };
  wrap.querySelector('#close-lore-popup').onclick = close;
  wrap.querySelector('#dismiss-lore').onclick = close;
  wrap.querySelector('#open-chronicle').onclick = () => {
    close();
    switchView('chronicle');
  };
}

// NAVIGATION + ROOT DOM
document.body.innerHTML = `
  <nav id="main-nav" style="display:flex;gap:8px;padding:8px 12px;background:#1a1d22;color:#ddd;position:sticky;top:0;z-index:3000;">
    <button data-nav="main" style="padding:6px 12px;cursor:pointer;">Forside</button>
    <button data-nav="chronicle" style="padding:6px 12px;cursor:pointer;">Krøniken</button>
  </nav>
  <div id="view-main">
    <div id="overlay">
      <h1 class="kro-header">🍻 Eryndors Kro</h1>
      <div id="progressbar"></div>
      <div id="story"></div>
      <div id="profile"></div>
      <div id="quests"></div>
      <div id="activequests"></div>
      <div id="mentor-overlay" style="display:none;"></div>
      <div id="lore-popup-container" style="position:fixed;inset:0;pointer-events:none;z-index:5000;"></div>
    </div>
  </div>
  <div id="view-chronicle" style="display:none;padding:16px 18px 60px;">
    <!-- Krønike view genereres dynamisk -->
  </div>
`;

document.querySelectorAll('[data-nav]').forEach(btn => {
  btn.onclick = () => switchView(btn.getAttribute('data-nav'));
});

function switchView(view) {
  if (view === state.currentView) return;
  state.currentView = view;
  document.getElementById('view-main').style.display = view === 'main' ? '' : 'none';
  document.getElementById('view-chronicle').style.display = view === 'chronicle' ? '' : 'none';
  if (view === 'chronicle') {
    renderChronicleView();
  }
}

// MAIN VIEW RENDER
function renderProgressBar() {
  const totalLevel = calcLevel(state.xp);
  const progress = calcProgress(state.xp);
  document.getElementById("progressbar").innerHTML = `
    <div class="kro-xp-bar-container">
      <span class="kro-xp-emblem">${levelEmblems[totalLevel] || ""}</span>
      <div class="kro-xp-bar"><div class="kro-xp-bar-fill" style="width:${Math.round(progress * 100)}%"></div></div>
      <span class="kro-xp-bar-label">Level ${totalLevel} / XP: ${state.xp - xpForLevel(totalLevel)} / ${xpRequiredForLevel(totalLevel)}</span>
    </div>
  `;
}

function renderStory() {
  const div = document.getElementById("story");
  const idx = Math.max(0, Math.min(storyChapters.length - 1, getCurrentStoryChapter()));
  const chapter = storyChapters[idx];
  div.innerHTML = `
    <div class="kro-storybox">
      <h2 class="kro-storytitle">${chapter.title}</h2>
      <div class="kro-storybody">${chapter.text}</div>
    </div>
  `;
}

function renderProfile() {
  const div = document.getElementById("profile");
  div.innerHTML = `
    <div class="kro-profilbox">
      <span class="kro-xp-header">🍺 Stjernelys: <b>${state.xp}</b> 🪙</span>
    </div>
    <div class="kro-mentors">
      <div class="kro-mentors-row">
        ${archetypes.map(a => {
          const xp = state.archetypeXP[a.id];
          const level = calcLevel(xp);
          const progress = calcProgress(xp);
          return `
            <span class="kro-mentorbox" data-mentor="${a.id}">
              <span class="kro-mentor-main">${a.icon || ''} <b>${a.name}</b></span>
              <span class="kro-mentor-progressbar">
                <span class="kro-mentor-emblem">${levelEmblems[level] || ""}</span>
                <div class="kro-mentor-bar"><div class="kro-mentor-bar-fill" style="width:${Math.round(progress * 100)}%"></div></div>
                <span class="kro-mentor-bar-label">Level ${level}</span>
              </span>
            </span>
          `;
        }).join("")}
      </div>
    </div>
  `;
  div.querySelectorAll("[data-mentor]").forEach(el => el.onclick = () => showMentorOverlay(el.getAttribute("data-mentor")));
}

function showMentorOverlay(mentorId) {
  const mentor = archetypes.find(a => a.id === mentorId);
  if (!mentor) return;
  const overlay = document.getElementById("mentor-overlay");
  const mentorQuests = state.tavleQuests.concat(state.active).filter(q => q.archetype === mentorId && !q.completed);
  const xp = state.archetypeXP[mentorId];
  const level = calcLevel(xp);
  overlay.innerHTML = `
    <div class="kro-mentor-overlaybox">
      <button class="kro-btn kro-close" id="close-mentor-overlay">✖</button>
      <div class="kro-mentor-overlay-header">
        <span class="kro-mentor-overlay-icon">${mentor.icon || ''}</span>
        <span class="kro-mentor-overlay-title">${mentor.name}</span>
      </div>
      <p class="kro-mentor-background">${mentor.description || ''}</p>
      <div class="kro-mentor-overlay-progressbar">
        <span class="kro-mentor-emblem">${levelEmblems[level] || ""}</span>
        <div class="kro-mentor-bar"><div class="kro-mentor-bar-fill" style="width:${Math.round(calcProgress(xp) * 100)}%"></div></div>
        <span class="kro-mentor-bar-label">Level ${level} – XP: ${xp - xpForLevel(level)} / ${xpRequiredForLevel(level)}</span>
      </div>
      <hr />
      <h3>Achievements</h3>
      <div class="kro-mentor-achievements"><em>Ikke implementeret pr. mentor endnu.</em></div>
      <h3>Badges</h3>
      <div class="kro-mentor-badges"><em>Ingen badges endnu.</em></div>
      <hr/>
      <div class="kro-mentor-overlay-quests">
        <h3 style="margin-top:0;">Quests hos ${mentor.name}</h3>
        ${mentorQuests.length === 0
          ? "<i>Ingen åbne quests hos denne mentor.</i>"
          : mentorQuests.map(q => `
            <div class="kro-questroll">
              <b>${q.name}</b>
              <div class="kro-questdesc">${q.desc}</div>
              <div class="kro-questpts">XP: <b>${q.xp}</b> | Kravniveau: ${q.level}</div>
              ${q.type === "progress" ? `<div>Fremgang: ${q.progress} / ${q.vars[q.goal]}</div>` : ""}
            </div>
          `).join("")}
      </div>
    </div>
  `;
  overlay.style.display = "flex";
  document.getElementById("close-mentor-overlay").onclick = () => { overlay.style.display = "none"; overlay.innerHTML = ""; };
}

// QUEST TAVLE
function refillTavleQuests() {
  while (state.tavleQuests.length < MAX_QUESTS_ON_TAVLE) {
    state.tavleQuests.push(generateQuestList(1)[0]);
  }
}

function renderQuests() {
  refillTavleQuests();
  const div = document.getElementById("quests");
  div.innerHTML = `<h2 class="kro-questheader">📜 Quests på tavlen</h2><div class="kro-quests"></div>`;
  const questsDiv = div.querySelector('.kro-quests');
  questsDiv.innerHTML = "";
  state.tavleQuests.forEach(q => {
    if (!q) return;
    let progressHtml = "";
    if (q.type === "progress") {
      progressHtml = `<div class="kro-quest-progress">
        Fremgang: ${q.progress} / ${q.vars[q.goal]}
        <button class="kro-btn" data-progress="${q.id}">+1</button>
      </div>`;
    }
    const el = document.createElement("div");
    el.className = "kro-questroll";
    el.innerHTML = `
      <span class="kro-questicon">${q.icon}</span>
      <b>${q.name}</b>
      <div class="kro-questdesc">${q.desc}</div>
      <div class="kro-questpts">XP: <b>${q.xp}</b> | Niveau: ${q.level} ${levelEmblems[q.level] || ""}</div>
      ${progressHtml}
      <button class="kro-btn" data-accept="${q.id}">Acceptér quest</button>
    `;
    questsDiv.appendChild(el);
  });

  questsDiv.querySelectorAll("[data-accept]").forEach(btn => {
    btn.onclick = () => {
      const qid = btn.getAttribute("data-accept");
      const idx = state.tavleQuests.findIndex(q => q.id === qid);
      if (idx >= 0) {
        state.active.push(state.tavleQuests[idx]);
        state.tavleQuests.splice(idx, 1);
        renderQuests();
        renderActiveQuests();
      }
    };
  });
  questsDiv.querySelectorAll("[data-progress]").forEach(btn => {
    btn.onclick = () => {
      const qid = btn.getAttribute("data-progress");
      const quest = state.tavleQuests.find(q => q.id === qid);
      if (quest) {
        updateQuestProgress(quest, 1);
        renderQuests();
      }
    };
  });
}

function renderActiveQuests() {
  const div = document.getElementById("activequests");
  div.innerHTML = `<h2 class="kro-questheader">🎒 Aktive quests</h2><div class="kro-quests"></div>`;
  const questsDiv = div.querySelector('.kro-quests');
  questsDiv.innerHTML = "";
  state.active.forEach(q => {
    if (!q) return;
    let progressHtml = "";
    if (q.type === "progress") {
      progressHtml = `<div class="kro-quest-progress">
        Fremgang: ${q.progress} / ${q.vars[q.goal]}
        <button class="kro-btn" data-progress-active="${q.id}">+1</button>
      </div>`;
    }
    const el = document.createElement("div");
    el.className = "kro-questroll";
    el.innerHTML = `
      <span class="kro-questicon">${q.icon}</span>
      <b>${q.name}</b>
      <div class="kro-questdesc">${q.desc}</div>
      <div class="kro-questpts">XP: <b>${q.xp}</b> | Niveau: ${q.level} ${levelEmblems[q.level] || ""}</div>
      ${progressHtml}
      <button class="kro-btn" data-complete="${q.id}">Gennemfør quest</button>
      <button class="kro-btn kro-drop" data-drop="${q.id}">Drop quest</button>
    `;
    questsDiv.appendChild(el);
  });

  questsDiv.querySelectorAll("[data-complete]").forEach(btn => {
    btn.onclick = () => {
      const qid = btn.getAttribute("data-complete");
      const idx = state.active.findIndex(q => q.id === qid);
      if (idx >= 0) {
        const quest = state.active[idx];
        const goalOk = quest.type !== 'progress'
          || quest.completed
          || (quest.vars && quest.goal && quest.progress >= quest.vars[quest.goal]);
        if (!goalOk) return;
        // Registrer som completed
        state.completed.push({
          id: quest.id,
          name: quest.name,
          archetype: quest.archetype,
          xp: quest.xp,
          type: quest.type,
          levelRequirement: quest.level,
          completedAt: Date.now()
        });
        state.xp += quest.xp;
        const aId = quest.archetype;
        if (aId && state.archetypeXP[aId] != null) {
          const before = calcLevel(state.archetypeXP[aId]);
          state.archetypeXP[aId] += quest.xp;
          const after = calcLevel(state.archetypeXP[aId]);
          for (let lvl = before + 1; lvl <= after; lvl++) unlockLore(aId, lvl);
          state.archetypeLevel[aId] = after;
        } else if (aId) {
          console.warn("Quest archetype ikke i registry:", aId);
        }
        state.active.splice(idx, 1);
        checkAchievements();
        renderProgressBar();
        renderStory();
        renderProfile();
        renderQuests();
        renderActiveQuests();
        if (state.currentView === 'chronicle') renderChronicleView();
      }
    };
  });

  questsDiv.querySelectorAll("[data-drop]").forEach(btn => {
    btn.onclick = () => {
      const qid = btn.getAttribute("data-drop");
      const idx = state.active.findIndex(q => q.id === qid);
      if (idx >= 0) {
        state.active.splice(idx, 1);
        renderActiveQuests();
        renderQuests();
      }
    };
  });

  questsDiv.querySelectorAll("[data-progress-active]").forEach(btn => {
    btn.onclick = () => {
      const qid = btn.getAttribute("data-progress-active");
      const quest = state.active.find(q => q.id === qid);
      if (quest) {
        updateQuestProgress(quest, 1);
        if (quest.vars && quest.goal && quest.progress >= quest.vars[quest.goal]) quest.completed = true;
        renderActiveQuests();
      }
    };
  });
}

// KRØNIKE VIEW
function renderChronicleView() {
  const container = document.getElementById('view-chronicle');
  container.innerHTML = `
    <h1>📖 Krøniken</h1>
    <section id="chron-stats"></section>
    <section id="chron-achievements"></section>
    <section id="chron-completed"></section>
    <section id="chron-lore"></section>
  `;
  renderStatsSection();
  renderAchievementsSection();
  renderCompletedSection();
  renderLoreSection();
}

// Stats
function renderStatsSection() {
  const el = document.getElementById('chron-stats');
  const totalQuests = state.completed.length;
  const byArchetype = {};
  let totalArchetypeXP = 0;
  for (const a of archetypes) {
    const xp = state.archetypeXP[a.id];
    totalArchetypeXP += xp;
    const count = state.completed.filter(q => q.archetype === a.id).length;
    byArchetype[a.id] = { name: a.name, count, level: calcLevel(xp) };
  }
  el.innerHTML = `
    <h2>Stats</h2>
    <ul>
      <li>Total XP: <b>${state.xp}</b></li>
      <li>Gennemførte quests: <b>${totalQuests}</b></li>
    </ul>
    <div style="display:flex;flex-wrap:wrap;gap:14px;">
      ${Object.entries(byArchetype).map(([id, o]) => `
        <div style="border:1px solid #444;padding:8px 10px;border-radius:6px;min-width:140px;">
          <strong>${o.name}</strong><br/>
          Quests: ${o.count}<br/>
          Level: ${o.level}
        </div>
      `).join('')}
    </div>
  `;
}

// Achievements
function renderAchievementsSection() {
  const el = document.getElementById('chron-achievements');
  const unlocked = [];
  const locked = [];
  for (const def of achievementDefs) {
    if (state.achievementsUnlocked.has(def.id)) unlocked.push(def); else locked.push(def);
  }
  function block(title, arr, isUnlocked) {
    if (!arr.length) return '';
    return `
      <div>
        <h3>${title}</h3>
        <div style="display:flex;flex-wrap:wrap;gap:10px;">
          ${arr.map(a => `
            <div style="
              border:1px solid ${isUnlocked ? '#3d6640' : '#444'};
              background:${isUnlocked ? '#1f3121' : '#1e1f22'};
              padding:8px 10px;border-radius:6px;max-width:200px;font-size:0.85rem;
            ">
              <strong>${a.title}</strong><br/>
              <span style="opacity:.85;">${a.desc}</span><br/>
              ${isUnlocked ? `<span style="color:#6fcf70;">✓</span>` : `<span style="color:#888;">Låst</span>`}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  el.innerHTML = `
    <h2>Achievements</h2>
    ${block('Låst op', unlocked, true)}
    ${block('Låste', locked, false)}
  `;
}

// Completed Quests
function renderCompletedSection() {
  const el = document.getElementById('chron-completed');
  if (!state.completed.length) {
    el.innerHTML = `<h2>Gennemførte Quests</h2><em>Ingen endnu.</em>`;
    return;
  }
  // Nyeste først
  const list = [...state.completed].sort((a,b)=>b.completedAt - a.completedAt);
  el.innerHTML = `
    <h2>Gennemførte Quests</h2>
    <div style="overflow-x:auto;">
      <table style="border-collapse:collapse;width:100%;font-size:0.85rem;">
        <thead>
          <tr style="background:#222;">
            <th style="text-align:left;padding:4px 6px;">Navn</th>
            <th style="text-align:left;padding:4px 6px;">Arketype</th>
            <th style="text-align:right;padding:4px 6px;">XP</th>
            <th style="text-align:right;padding:4px 6px;">Req lvl</th>
            <th style="text-align:left;padding:4px 6px;">Type</th>
            <th style="text-align:left;padding:4px 6px;">Tidspunkt</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(q => `
            <tr style="border-top:1px solid #333;">
              <td style="padding:4px 6px;">${q.name}</td>
              <td style="padding:4px 6px;">${(archetypeMap[q.archetype]?.name) || q.archetype || ''}</td>
              <td style="padding:4px 6px;text-align:right;">${q.xp}</td>
              <td style="padding:4px 6px;text-align:right;">${q.levelRequirement ?? ''}</td>
              <td style="padding:4px 6px;">${q.type || ''}</td>
              <td style="padding:4px 6px;">${new Date(q.completedAt).toLocaleString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// Lore
function renderLoreSection() {
  const el = document.getElementById('chron-lore');
  if (!state.chronicleLore.length) {
    el.innerHTML = `<h2>Lore</h2><em>Ingen lore endnu.</em>`;
    return;
  }
  const list = [...state.chronicleLore].sort((a,b)=> b.ts - a.ts);
  el.innerHTML = `
    <h2>Lore</h2>
    <div style="display:grid;gap:14px;">
      ${list.map(entry => `
        <div style="border:1px solid #444;border-radius:8px;padding:10px 12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <strong>${entry.archetypeName} – Level ${entry.level}</strong>
            <span style="font-size:0.7rem;opacity:.6;">${new Date(entry.ts).toLocaleTimeString()}</span>
          </div>
            <div style="margin:4px 0 6px 0;font-weight:600;">${entry.majorLore}</div>
            ${entry.minorLore.length
              ? `<ul style="margin:0 0 0 18px;padding:0;">${entry.minorLore.map(m => `<li>${m}</li>`).join('')}</ul>`
              : ''
            }
        </div>
      `).join('')}
    </div>
  `;
}

// INITIAL RENDER MAIN
renderProgressBar();
renderStory();
renderProfile();
renderQuests();
renderActiveQuests();
checkAchievements(); // initial

// (Valgfri) Du kan kalde switchView('chronicle') i konsol for at teste hurtigt.
