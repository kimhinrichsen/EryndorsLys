import { storyChapters } from './story.js';
import { generateQuestList, updateQuestProgress } from './Questgenerator.js';
import { archetypes as archetypesFromRegistry, archetypeMap } from './archetypes.js';

// ORIGINAL liste (bevaret som reference – bruges ikke i logikken mere)
const archetypesOriginal = [
  { id: "skyggeskriver", name: "Skyggeskriver", icon: "🧙‍♂️" },
  { id: "horisontløber", name: "Horisontløber", icon: "🏇" },
  { id: "tågevogter", name: "Tågevogter", icon: "🌿" },
  { id: "sagnsmed", name: "Sagnsmed", icon: "🛡️" },
  { id: "nattesøger", name: "Nattesøger", icon: "🦉" },
  { id: "trådmester", name: "Trådmester", icon: "🤹‍♂️" }
];

// AKTUEL liste (med lore)
const archetypes = archetypesFromRegistry;

const levelEmblems = {
  1: "🔸",
  2: "✨",
  3: "⭐",
  4: "🌟",
  5: "🌠"
};

const MAX_QUESTS_ON_TAVLE = 6;

// XP kurve
const XP_BASE = 50;
const XP_EXPONENT = 1.25;

function xpRequiredForLevel(level) {
  return Math.floor(XP_BASE * Math.pow(level, XP_EXPONENT));
}
function xpForLevel(level) {
  let xp = 0;
  for (let i = 1; i < level; i++) xp += xpRequiredForLevel(i);
  return xp;
}
function calcLevel(xp, maxLevel = 100) {
  for (let lvl = 1; lvl < maxLevel; lvl++) {
    if (xp < xpForLevel(lvl + 1)) return lvl;
  }
  return maxLevel;
}
function calcProgress(xp, maxLevel = 100) {
  const level = calcLevel(xp, maxLevel);
  const xpCurrentLevel = xpForLevel(level);
  const xpNextLevel = xpForLevel(level + 1);
  return Math.min((xp - xpCurrentLevel) / (xpNextLevel - xpCurrentLevel), 1);
}
function getCurrentStoryChapter() {
  return calcLevel(state.xp) - 1;
}

function getMentorLore(id, levelOverride) {
  const a = archetypeMap?.[id];
  if (!a) return null;
  const lvl = levelOverride || calcLevel(state.archetypeXP[id]);
  return a.levels?.find(l => l.level === lvl) || null;
}

// STATE
const state = {
  xp: 0,
  archetypeXP: Object.fromEntries(archetypes.map(a => [a.id, 0])),
  archetypeLevel: Object.fromEntries(archetypes.map(a => [a.id, 1])),
  active: [],
  completed: [],
  tavleQuests: generateQuestList(MAX_QUESTS_ON_TAVLE)
};

// DOM skeleton
document.body.innerHTML = `
  <div id="overlay">
    <h1 class="kro-header">🍻 Eryndors Kro</h1>
    <div id="progressbar"></div>
    <div id="story"></div>
    <div id="profile"></div>
    <div id="quests"></div>
    <div id="activequests"></div>
    <div id="mentor-overlay" style="display:none;"></div>
  </div>
`;

// RENDER FUNKTIONER
function renderProgressBar() {
  const totalLevel = calcLevel(state.xp);
  const progress = calcProgress(state.xp);
  document.getElementById("progressbar").innerHTML = `
    <div class="kro-xp-bar-container">
      <span class="kro-xp-emblem">${levelEmblems[totalLevel] || ""}</span>
      <div class="kro-xp-bar">
        <div class="kro-xp-bar-fill" style="width:${Math.round(progress * 100)}%"></div>
      </div>
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
      <span class="kro-xp-header">
        🍺 Stjernelys: <b>${state.xp}</b> <span style="font-size:1.15em;">🪙</span>
      </span>
    </div>
    <div class="kro-mentors">
      <div class="kro-mentors-row">
        ${archetypes.map(a => {
          const xp = state.archetypeXP[a.id];
          const level = calcLevel(xp);
            const progress = calcProgress(xp);
          return `
            <span class="kro-mentorbox" data-mentor="${a.id}">
              <span class="kro-mentor-main">
                ${a.icon || ''} <b>${a.name}</b>
              </span>
              <span class="kro-mentor-progressbar">
                <span class="kro-mentor-emblem">${levelEmblems[level] || ""}</span>
                <div class="kro-mentor-bar">
                  <div class="kro-mentor-bar-fill" style="width:${Math.round(progress * 100)}%"></div>
                </div>
                <span class="kro-mentor-bar-label">Level ${level} / XP: ${xp - xpForLevel(level)} / ${xpRequiredForLevel(level)}</span>
              </span>
            </span>
          `;
        }).join("")}
      </div>
    </div>
  `;

  Array.from(div.querySelectorAll("[data-mentor]")).forEach(el => {
    el.onclick = () => showMentorOverlay(el.getAttribute("data-mentor"));
  });
}

function showMentorOverlay(mentorId) {
  const mentor = archetypes.find(a => a.id === mentorId);
  if (!mentor) return;
  const overlay = document.getElementById("mentor-overlay");
  const mentorQuests = state.tavleQuests.concat(state.active)
    .filter(q => q.archetype === mentorId && !q.completed);
  const xp = state.archetypeXP[mentorId];
  const level = calcLevel(xp);
  const lore = getMentorLore(mentorId, level);
  overlay.innerHTML = `
    <div class="kro-mentor-overlaybox">
      <button class="kro-btn kro-close" id="close-mentor-overlay">✖</button>
      <div class="kro-mentor-overlay-header">
        <span class="kro-mentor-overlay-icon">${mentor.icon || ''}</span>
        <span class="kro-mentor-overlay-title">${mentor.name}</span>
      </div>
      <div class="kro-mentor-overlay-progressbar">
        <span class="kro-mentor-emblem">${levelEmblems[level] || ""}</span>
        <div class="kro-mentor-bar">
          <div class="kro-mentor-bar-fill" style="width:${Math.round(calcProgress(xp) * 100)}%"></div>
        </div>
        <span class="kro-mentor-bar-label">Level ${level} / XP: ${xp - xpForLevel(level)} / ${xpRequiredForLevel(level)}</span>
      </div>
      ${lore ? `
        <div class="kro-mentor-lore">
          <p><strong>${lore.majorLore}</strong></p>
          <ul>${(lore.minorLore || []).map(m => `<li>${m}</li>`).join('')}</ul>
        </div>` : '<em>Ingen lore for dette level.</em>'
      }
      <hr />
      <div class="kro-mentor-overlay-quests">
        <h3 style="margin-top:0;">Quests hos ${mentor.name}</h3>
        ${mentorQuests.length === 0 ? "<i>Ingen åbne quests hos denne mentor.</i>" : mentorQuests.map(q => `
          <div class="kro-questroll">
            <b>${q.name}</b>
            <div class="kro-questdesc">${q.desc}</div>
            <div class="kro-questpts">XP: <b>${q.xp}</b> | Niveau: ${q.level}</div>
            ${q.type === "progress" ? `<div>Fremgang: ${q.progress} / ${q.vars[q.goal]}</div>` : ""}
            <span style="color:#aaa;">${state.active.includes(q) ? "Allerede aktiv" : ""}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
  overlay.style.display = "flex";
  document.getElementById("close-mentor-overlay").onclick = () => {
    overlay.style.display = "none";
    overlay.innerHTML = "";
  };
}

// Level-up toast
function notifyLevelUp(archetypeId, newLevel) {
  const a = archetypeMap[archetypeId];
  if (!a) return;
  const lore = a.levels?.find(l => l.level === newLevel);
  const box = document.createElement('div');
  box.className = 'kro-levelup-toast';
  box.innerHTML = `
    <strong>${a.name} – Level ${newLevel}!</strong><br/>
    ${lore ? lore.majorLore : '<em>Ingen lore for dette level endnu.</em>'}
  `;
  document.body.appendChild(box);
  requestAnimationFrame(() => box.classList.add('show'));
  setTimeout(() => {
    box.classList.remove('show');
    setTimeout(() => box.remove(), 400);
  }, 4500);
}

// Quest tavle fyld
function refillTavleQuests() {
  while (state.tavleQuests.length < MAX_QUESTS_ON_TAVLE) {
    state.tavleQuests.push(generateQuestList(1)[0]);
  }
}

function renderQuests() {
  refillTavleQuests();
  const div = document.getElementById("quests");
  div.innerHTML = `<h2 class="kro-questheader">📜 Quests på tavlen</h2>
    <div class="kro-quests"></div>
  `;
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
  div.innerHTML = `<h2 class="kro-questheader">🎒 Aktive quests</h2>
    <div class="kro-quests"></div>
  `;
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
        if (quest.type === "instant" || quest.completed) {
          state.completed.push(quest);
          state.xp += quest.xp;
          const aId = quest.archetype;
          if (aId && state.archetypeXP[aId] != null) {
            const before = calcLevel(state.archetypeXP[aId]);
            state.archetypeXP[aId] += quest.xp;
            const after = calcLevel(state.archetypeXP[aId]);
            state.archetypeLevel[aId] = after;
            if (after > before) notifyLevelUp(aId, after);
          }
          state.active.splice(idx, 1);
          renderProgressBar();
          renderStory();
          renderProfile();
          renderQuests();
          renderActiveQuests();
        }
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
        renderActiveQuests();
      }
    };
  });
}

// INITIAL RENDER
renderProgressBar();
renderStory();
renderProfile();
renderQuests();
renderActiveQuests();
