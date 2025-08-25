/* Eryndors Lys – app.js (Forside + separat Krønike-side)
   Features:
   - Separat "chronicle" view (stats, achievements, completed quests, lore) åbnes via bog-ikon nederst på forsiden
   - Forsiden tilbage til enkelt layout uden krønikedata
   - Centrering af alt indhold (max-width shell)
   - Pagination i krønikken (2 sektioner/opslag)
   - Pulserende bog-ikon (kan fjernes ved at droppe .pulse class)
   - LocalStorage persistence (v4) inkl. currentView
   - ESC i krønikke-view vender tilbage til main
   - Level-up lore popup og achievement toast kun på main
   - Canonical normalisering af arketype-id'er
*/

import { storyChapters } from './story.js';
import { generateQuestList, updateQuestProgress } from './Questgenerator.js';
import { archetypes as archetypesFromRegistry, archetypeMap, getArchetypeLore } from './archetypes.js';

/* ---------- KONSTANTER ---------- */
const SAVE_KEY = 'eryndors_state_v4';
const SAVE_DEBOUNCE_MS = 400;
const MAX_QUESTS_ON_TAVLE = 6;
const XP_BASE = 50;
const XP_EXPONENT = 1.25;
const levelEmblems = {1:"🔸",2:"✨",3:"⭐",4:"🌟",5:"🌠"};
const CHRON_SECTIONS = ['stats','achievements','completed','lore'];
const CHRON_PER_VIEW = 2;

const archetypes = archetypesFromRegistry;

/* ---------- XP / LEVEL HELPERS ---------- */
function xpRequiredForLevel(l){ return Math.floor(XP_BASE * Math.pow(l, XP_EXPONENT)); }
function xpForLevel(l){ let x=0; for(let i=1;i<l;i++) x+=xpRequiredForLevel(i); return x; }
function calcLevel(x, max=100){ for(let L=1;L<max;L++){ if(x < xpForLevel(L+1)) return L; } return max; }
function calcProgress(x, max=100){
  const L=calcLevel(x,max), b=xpForLevel(L), n=xpForLevel(L+1);
  return Math.min((x-b)/(n-b),1);
}
function getCurrentStoryChapter(){ return calcLevel(state.xp)-1; }

/* ---------- STATE ---------- */
const state = {
  currentView: 'main',
  xp: 0,
  archetypeXP: Object.fromEntries(archetypes.map(a=>[a.id,0])),
  archetypeLevel: Object.fromEntries(archetypes.map(a=>[a.id,1])),
  active: [],
  completed: [],
  tavleQuests: generateQuestList(MAX_QUESTS_ON_TAVLE),
  chronicleLore: [],
  achievementsUnlocked: new Set(),
  chroniclePage: 0
};

/* ---------- CANONICAL ARKETYPE ID ---------- */
const _canonIdx = (() => {
  function norm(s){
    return (s||'').toString().trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,'');
  }
  const map={};
  archetypes.forEach(a=>{
    map[norm(a.id)] = a.id;
    map[norm(a.name)] = a.id;
  });
  return {norm,map};
})();
function canonicalArchetypeId(raw){
  if(!raw) return null;
  const n=_canonIdx.norm(raw);
  return _canonIdx.map[n] || raw;
}
state.tavleQuests.forEach(q=> q.archetype = canonicalArchetypeId(q.archetype));

/* ---------- ACHIEVEMENTS ---------- */
const achievementDefs = [
  {id:'first_quest', title:'Første Skridt', desc:'Gennemfør 1 quest', check:()=>state.completed.length>=1},
  {id:'ten_quests', title:'Ti i Tasken', desc:'Gennemfør 10 quests', check:()=>state.completed.length>=10},
  {id:'total_xp_500', title:'Stjernelys 500', desc:'Opnå 500 samlet XP', check:()=>state.xp>=500},
  ...archetypes.map(a=>({
    id:`archetype_lvl_3_${a.id}`,
    title:`${a.name} III`,
    desc:`Nå level 3 med ${a.name}`,
    check:()=>calcLevel(state.archetypeXP[a.id])>=3
  }))
];

function checkAchievements(reason){
  const newly=[];
  for(const def of achievementDefs){
    if(!state.achievementsUnlocked.has(def.id) && def.check()){
      state.achievementsUnlocked.add(def.id);
      newly.push(def);
      if(state.currentView === 'main') showAchievementToast(def);
    }
  }
  if(newly.length){
    if(state.currentView === 'chronicle') renderChronicleView();
    scheduleSave(reason||'achievements');
  }
}

function showAchievementToast(def){
  const box=document.createElement('div');
  box.className='ach-toast';
  box.innerHTML=`<strong>${def.title}</strong><br><span>${def.desc}</span>`;
  Object.assign(box.style,{
    position:'fixed',bottom:'1rem',left:'1rem',
    background:'linear-gradient(135deg,#234e28,#1a3520)',
    color:'#e2f8e5',padding:'12px 16px',
    border:'1px solid #3d6a42',borderRadius:'10px',
    font:'13px/1.4 system-ui,Arial,sans-serif',
    zIndex:9999,maxWidth:'260px',
    boxShadow:'0 6px 18px rgba(0,0,0,.45)',
    opacity:'0',transform:'translateY(8px)',
    transition:'opacity .4s, transform .4s'
  });
  document.body.appendChild(box);
  requestAnimationFrame(()=>{ box.style.opacity='1'; box.style.transform='translateY(0)'; });
  setTimeout(()=>{
    box.style.opacity='0'; box.style.transform='translateY(8px)';
    setTimeout(()=>box.remove(),450);
  },4600);
}

/* ---------- LORE / LEVEL-UP ---------- */
function unlockLoreOrFallback(archetypeId, level){
  const lore = getArchetypeLore(archetypeId, level);
  if(!lore){
    if(state.currentView==='main'){
      showLorePopup({
        archetypeName: archetypeMap[archetypeId]?.name || archetypeId,
        level, majorLore:'(Ingen lore endnu – men du steg i niveau!)', minorLore:[]
      });
    }
    return;
  }
  const key=`${archetypeId}_${level}`;
  if(!state.chronicleLore.some(e=>e.id===key)){
    state.chronicleLore.push({
      id:key,
      archetypeId,
      archetypeName: archetypeMap[archetypeId]?.name || archetypeId,
      level,
      majorLore:lore.majorLore,
      minorLore:lore.minorLore||[],
      ts:Date.now()
    });
  }
  if(state.currentView==='main'){
    showLorePopup({
      archetypeName: archetypeMap[archetypeId]?.name || archetypeId,
      level,
      majorLore:lore.majorLore,
      minorLore:lore.minorLore||[]
    });
  }
  scheduleSave('loreUnlock');
}

function showLorePopup(entry){
  let container=document.getElementById('lore-popup-container');
  if(!container){
    container=document.createElement('div');
    container.id='lore-popup-container';
    container.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:5000;';
    document.body.appendChild(container);
  }
  const wrap=document.createElement('div');
  wrap.style.cssText=`
    position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
    background:rgba(15,18,25,0.55);backdrop-filter:blur(4px);pointer-events:auto;z-index:5001;
  `;
  wrap.innerHTML=`
    <div style="background:#1f252c;color:#f1f5f7;max-width:560px;width:clamp(300px,70%,560px);
      border:1px solid #32404d;border-radius:18px;padding:26px 30px;
      font:14px/1.48 system-ui,Arial,sans-serif;position:relative;
      box-shadow:0 10px 40px -4px rgba(0,0,0,.55); animation:fadeIn .25s;">
      <button id="close-lore-popup" style="position:absolute;top:12px;right:14px;background:#2c3640;color:#c9d2d9;
        border:1px solid #44525e;border-radius:6px;cursor:pointer;padding:4px 8px;font-size:12px;">✖</button>
      <h2 style="margin:0 0 10px;font-size:21px;">${entry.archetypeName} – Level ${entry.level}</h2>
      <p style="margin:0 0 16px;font-weight:600;">${entry.majorLore}</p>
      ${entry.minorLore.length?`<ul style="margin:0 0 18px 20px;padding:0;">${entry.minorLore.map(m=>`<li>${m}</li>`).join('')}</ul>`:''}
      <div style="text-align:right;">
        <button id="dismiss-lore" style="background:#346296;color:#fff;border:1px solid #4476ae;border-radius:8px;
          padding:7px 16px;cursor:pointer;font-size:13px;font-weight:600;">Luk</button>
      </div>
    </div>`;
  container.appendChild(wrap);
  const close=()=>{ wrap.style.opacity='0'; wrap.style.transition='opacity .3s'; setTimeout(()=>wrap.remove(),260); };
  wrap.querySelector('#close-lore-popup').onclick=close;
  wrap.querySelector('#dismiss-lore').onclick=close;
}

/* ---------- DOM SKELETON (TWO VIEWS) ---------- */
document.body.innerHTML = `
  <div id="main-view" class="view">
    <div class="app-shell">
      <header class="top-header">
        <h1 class="kro-header">🍻 Eryndors Kro</h1>
      </header>
      <section id="progressbar"></section>
      <section id="story"></section>
      <section id="profile"></section>
      <section id="quests"></section>
      <section id="activequests"></section>
    </div>
    <div id="mentor-overlay" style="display:none;"></div>
    <div id="lore-popup-container" style="position:fixed;inset:0;pointer-events:none;z-index:5000;"></div>
    <button id="chronicle-launcher" class="chronicle-launch pulse" title="Åbn Krøniken">
      <span class="icon">📖</span>
      <span class="label">Krøniken</span>
    </button>
  </div>

  <div id="chronicle-view" class="view" style="display:none;">
    <div class="chron-shell">
      <header class="chron-topbar">
        <button id="back-to-main" class="btn back-btn">⬅ Tilbage</button>
        <h2 class="chron-title">Krøniken</h2>
        <div class="chron-actions">
          <button id="save-now" class="btn ghost">💾 Gem</button>
        </div>
      </header>
      <div class="chron-paginationbar">
        <button id="chron-prev" class="btn mini" title="Forrige">⬅</button>
        <div class="pager-indicator"><span id="chron-page-current">1</span>/<span id="chron-page-total">2</span></div>
        <button id="chron-next" class="btn mini" title="Næste">➡</button>
      </div>
      <div class="chron-content">
        <section class="chron-section" data-chron="stats">
          <h3>Stats</h3>
          <div id="chron-stats"></div>
        </section>
        <section class="chron-section" data-chron="achievements">
          <h3>Achievements</h3>
          <div id="chron-achievements"></div>
        </section>
        <section class="chron-section" data-chron="completed">
          <h3>Gennemførte Quests</h3>
          <div id="chron-completed"></div>
        </section>
        <section class="chron-section" data-chron="lore">
          <h3>Lore</h3>
          <div id="chron-lore"></div>
        </section>
      </div>
    </div>
  </div>
`;

/* ---------- VIEW SWITCH ---------- */
function switchView(view){
  if(view === state.currentView) return;
  state.currentView = view;
  document.getElementById('main-view').style.display = view==='main' ? '' : 'none';
  document.getElementById('chronicle-view').style.display = view==='chronicle' ? '' : 'none';
  if(view==='chronicle'){
    renderChronicleView();
  }
  scheduleSave('switchView');
}
document.getElementById('chronicle-launcher').onclick = () => switchView('chronicle');
document.getElementById('back-to-main').onclick = () => switchView('main');

/* ESC fra Krønikken */
window.addEventListener('keydown', e=>{
  if(e.key === 'Escape' && state.currentView==='chronicle'){
    switchView('main');
  }
});

/* ---------- RENDER MAIN VIEW ---------- */
function renderProgressBar(){
  const L=calcLevel(state.xp), p=calcProgress(state.xp);
  document.getElementById('progressbar').innerHTML=`
    <div class="kro-xp-bar-container">
      <span class="kro-xp-emblem">${levelEmblems[L]||''}</span>
      <div class="kro-xp-bar"><div class="kro-xp-bar-fill" style="width:${Math.round(p*100)}%"></div></div>
      <span class="kro-xp-bar-label">Level ${L} / XP: ${state.xp - xpForLevel(L)} / ${xpRequiredForLevel(L)}</span>
    </div>`;
}

function renderStory(){
  const idx=Math.max(0, Math.min(storyChapters.length-1, getCurrentStoryChapter()));
  const chapter=storyChapters[idx];
  document.getElementById('story').innerHTML=`
    <div class="kro-storybox">
      <h2 class="kro-storytitle">${chapter.title}</h2>
      <div class="kro-storybody">${chapter.text}</div>
    </div>`;
}

function renderProfile(){
  const div=document.getElementById('profile');
  div.innerHTML=`
    <div class="kro-profilbox">
      <span class="kro-xp-header">🍺 Stjernelys: <b>${state.xp}</b> 🪙</span>
    </div>
    <div class="kro-mentors">
      <div class="kro-mentors-row">
        ${archetypes.map(a=>{
          const xp=state.archetypeXP[a.id], lv=calcLevel(xp), pr=calcProgress(xp);
          return `<span class="kro-mentorbox" data-mentor="${a.id}">
            <span class="kro-mentor-main">${a.icon||''} <b>${a.name}</b></span>
            <span class="kro-mentor-progressbar">
              <span class="kro-mentor-emblem">${levelEmblems[lv]||''}</span>
              <div class="kro-mentor-bar"><div class="kro-mentor-bar-fill" style="width:${Math.round(pr*100)}%"></div></div>
              <span class="kro-mentor-bar-label">Level ${lv}</span>
            </span>
          </span>`;
        }).join('')}
      </div>
    </div>`;
  div.querySelectorAll('[data-mentor]').forEach(el=> el.onclick=()=>showMentorOverlay(el.getAttribute('data-mentor')));
}

function showMentorOverlay(id){
  id=canonicalArchetypeId(id);
  const mentor=archetypes.find(a=>a.id===id);
  if(!mentor) return;
  const overlay=document.getElementById('mentor-overlay');
  const mentorQuests = state.tavleQuests.concat(state.active).filter(q=>q.archetype===id && !q.completed);
  const xp=state.archetypeXP[id], lv=calcLevel(xp);
  overlay.innerHTML=`
    <div class="kro-mentor-overlaybox">
      <button class="kro-btn kro-close" id="close-mentor-overlay">✖</button>
      <div class="kro-mentor-overlay-header">
        <span class="kro-mentor-overlay-icon">${mentor.icon||''}</span>
        <span class="kro-mentor-overlay-title">${mentor.name}</span>
      </div>
      <p class="kro-mentor-background">${mentor.description||''}</p>
      <div class="kro-mentor-overlay-progressbar">
        <span class="kro-mentor-emblem">${levelEmblems[lv]||''}</span>
        <div class="kro-mentor-bar"><div class="kro-mentor-bar-fill" style="width:${Math.round(calcProgress(xp)*100)}%"></div></div>
        <span class="kro-mentor-bar-label">Level ${lv} – XP: ${xp - xpForLevel(lv)} / ${xpRequiredForLevel(lv)}</span>
      </div>
      <hr/>
      <h3>Achievements</h3><div class="kro-mentor-achievements"><em>Ikke pr. mentor endnu.</em></div>
      <h3>Badges</h3><div class="kro-mentor-badges"><em>Ingen badges endnu.</em></div>
      <hr/>
      <div class="kro-mentor-overlay-quests">
        <h3 style="margin-top:0;">Quests hos ${mentor.name}</h3>
        ${mentorQuests.length===0?'<i>Ingen åbne quests.</i>':
          mentorQuests.map(q=>`
            <div class="kro-questroll">
              <b>${q.name}</b>
              <div class="kro-questdesc">${q.desc}</div>
              <div class="kro-questpts">XP: <b>${q.xp}</b> | Kravniveau: ${q.level}</div>
              ${q.type==='progress'?`<div>Fremgang: ${q.progress} / ${q.vars[q.goal]}</div>`:''}
            </div>`).join('')}
      </div>
    </div>`;
  overlay.style.display='flex';
  overlay.querySelector('#close-mentor-overlay').onclick=()=>{ overlay.style.display='none'; overlay.innerHTML=''; };
}

function refillTavleQuests(){
  while(state.tavleQuests.length < MAX_QUESTS_ON_TAVLE){
    const n=generateQuestList(1)[0];
    if(n){ n.archetype = canonicalArchetypeId(n.archetype); state.tavleQuests.push(n); }
  }
}

function renderQuests(){
  refillTavleQuests();
  const div=document.getElementById('quests');
  div.innerHTML=`<h2 class="kro-questheader">📜 Quests på tavlen</h2><div class="kro-quests"></div>`;
  const wrap=div.querySelector('.kro-quests');
  wrap.innerHTML='';
  state.tavleQuests.forEach(q=>{
    if(!q) return;
    const progressHtml = q.type==='progress'
      ? `<div class="kro-quest-progress">Fremgang: ${q.progress} / ${q.vars[q.goal]}
           <button class="kro-btn" data-progress="${q.id}">+1</button></div>` : '';
    const el=document.createElement('div');
    el.className='kro-questroll';
    el.innerHTML=`
      <span class="kro-questicon">${q.icon||''}</span>
      <b>${q.name}</b>
      <div class="kro-questdesc">${q.desc}</div>
      <div class="kro-questpts">XP: <b>${q.xp}</b> | Niveau: ${q.level} ${levelEmblems[q.level]||''}</div>
      ${progressHtml}
      <button class="kro-btn" data-accept="${q.id}">Acceptér quest</button>`;
    wrap.appendChild(el);
  });
  wrap.querySelectorAll('[data-accept]').forEach(btn=>{
    btn.onclick=()=>{
      const id=btn.getAttribute('data-accept');
      const idx=state.tavleQuests.findIndex(q=>q.id===id);
      if(idx>=0){
        state.active.push(state.tavleQuests[idx]);
        state.tavleQuests.splice(idx,1);
        renderQuests(); renderActiveQuests(); scheduleSave('acceptQuest');
      }
    };
  });
  wrap.querySelectorAll('[data-progress]').forEach(btn=>{
    btn.onclick=()=>{
      const id=btn.getAttribute('data-progress');
      const quest=state.tavleQuests.find(q=>q.id===id);
      if(quest){ updateQuestProgress(quest,1); renderQuests(); scheduleSave('progressQuest'); }
    };
  });
}

function renderActiveQuests(){
  const div=document.getElementById('activequests');
  div.innerHTML=`<h2 class="kro-questheader">🎒 Aktive quests</h2><div class="kro-quests"></div>`;
  const wrap=div.querySelector('.kro-quests');
  wrap.innerHTML='';
  state.active.forEach(q=>{
    const progressHtml = q.type==='progress'
      ? `<div class="kro-quest-progress">Fremgang: ${q.progress} / ${q.vars[q.goal]}
          <button class="kro-btn" data-progress-active="${q.id}">+1</button></div>` : '';
    const el=document.createElement('div');
    el.className='kro-questroll';
    el.innerHTML=`
      <span class="kro-questicon">${q.icon||''}</span>
      <b>${q.name}</b>
      <div class="kro-questdesc">${q.desc}</div>
      <div class="kro-questpts">XP: <b>${q.xp}</b> | Niveau: ${q.level} ${levelEmblems[q.level]||''}</div>
      ${progressHtml}
      <div class="kro-quest-actions">
        <button class="kro-btn" data-complete="${q.id}">Gennemfør</button>
        <button class="kro-btn kro-drop" data-drop="${q.id}">Drop</button>
      </div>`;
    wrap.appendChild(el);
  });
  wrap.querySelectorAll('[data-complete]').forEach(btn=>{
    btn.onclick=()=>{
      const id=btn.getAttribute('data-complete');
      const idx=state.active.findIndex(q=>q.id===id);
      if(idx>=0){
        const quest=state.active[idx];
        const goalOk = quest.type!=='progress'
          || quest.completed
          || (quest.vars && quest.goal && quest.progress >= quest.vars[quest.goal]);
        if(!goalOk) return;
        state.completed.push({
          id:quest.id, name:quest.name, archetype:quest.archetype,
          xp:quest.xp, type:quest.type, levelRequirement:quest.level, completedAt:Date.now()
        });
        state.xp += quest.xp;
        const aId=canonicalArchetypeId(quest.archetype);
        if(aId && state.archetypeXP[aId]!=null){
          const before=calcLevel(state.archetypeXP[aId]);
          state.archetypeXP[aId]+=quest.xp;
          const after=calcLevel(state.archetypeXP[aId]);
          for(let L=before+1; L<=after; L++) unlockLoreOrFallback(aId, L);
          state.archetypeLevel[aId]=after;
        }
        state.active.splice(idx,1);
        renderProgressBar(); renderStory(); renderProfile(); renderQuests(); renderActiveQuests();
        checkAchievements('questComplete');
        scheduleSave('questComplete');
      }
    };
  });
  wrap.querySelectorAll('[data-drop]').forEach(btn=>{
    btn.onclick=()=>{
      const id=btn.getAttribute('data-drop');
      const idx=state.active.findIndex(q=>q.id===id);
      if(idx>=0){
        state.active.splice(idx,1);
        renderActiveQuests(); renderQuests(); scheduleSave('dropQuest');
      }
    };
  });
  wrap.querySelectorAll('[data-progress-active]').forEach(btn=>{
    btn.onclick=()=>{
      const id=btn.getAttribute('data-progress-active');
      const quest=state.active.find(q=>q.id===id);
      if(quest){
        updateQuestProgress(quest,1);
        if(quest.vars && quest.goal && quest.progress>=quest.vars[quest.goal]) quest.completed=true;
        renderActiveQuests(); scheduleSave('progressActiveQuest');
      }
    };
  });
}

/* ---------- KRØNIKE VIEW RENDER ---------- */
function renderChronicleView(){
  renderChronStats();
  renderChronAchievements();
  renderChronCompleted();
  renderChronLore();
  updateChronPagination();
}

function renderChronStats(){
  const el=document.getElementById('chron-stats');
  const total=state.completed.length;
  const by={};
  archetypes.forEach(a=>{
    const count=state.completed.filter(q=>q.archetype===a.id).length;
    by[a.id]={name:a.name,count,level:calcLevel(state.archetypeXP[a.id])};
  });
  el.innerHTML=`
    <div class="stats-summary">
      <div><b>Total XP:</b> ${state.xp}</div>
      <div><b>Gennemførte quests:</b> ${total}</div>
    </div>
    <div class="stats-grid">
      ${Object.values(by).map(o=>`
        <div class="stat-card">
          <div class="stat-title">${o.name}</div>
          <div class="stat-line"><span>Quests:</span> <b>${o.count}</b></div>
          <div class="stat-line"><span>Level:</span> <b>${o.level}</b></div>
        </div>`).join('')}
    </div>`;
}

function renderChronAchievements(){
  const el=document.getElementById('chron-achievements');
  const unlocked=[], locked=[];
  achievementDefs.forEach(d=> state.achievementsUnlocked.has(d.id)?unlocked.push(d):locked.push(d));
  function section(title, arr, ok){
    if(!arr.length) return '';
    return `
      <div class="ach-block">
        <h4>${title}</h4>
        <div class="ach-grid">
          ${arr.map(a=>`
            <div class="ach-item ${ok?'unlocked':''}">
              <div class="ach-item-title">${a.title}</div>
              <div class="ach-item-desc">${a.desc}</div>
              <div class="ach-item-status">${ok?'✓':'Låst'}</div>
            </div>`).join('')}
        </div>
      </div>`;
  }
  el.innerHTML = section('Åbnet', unlocked, true) + section('Låste', locked, false);
}

function renderChronCompleted(){
  const el=document.getElementById('chron-completed');
  if(!state.completed.length){ el.innerHTML='<em>Ingen endnu.</em>'; return; }
  const list=[...state.completed].sort((a,b)=>b.completedAt - a.completedAt);
  el.innerHTML=`
    <div class="qtable-wrap">
      <table class="qtable">
        <thead>
          <tr><th>Navn</th><th>Arketype</th><th>XP</th><th>Req lvl</th><th>Type</th><th>Tidspunkt</th></tr>
        </thead>
        <tbody>
          ${list.map(q=>`
            <tr>
              <td>${q.name}</td>
              <td>${archetypeMap[q.archetype]?.name||q.archetype||''}</td>
              <td class="num">${q.xp}</td>
              <td class="num">${q.levelRequirement ?? ''}</td>
              <td>${q.type||''}</td>
              <td>${new Date(q.completedAt).toLocaleString()}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderChronLore(){
  const el=document.getElementById('chron-lore');
  if(!state.chronicleLore.length){ el.innerHTML='<em>Ingen lore endnu.</em>'; return; }
  const list=[...state.chronicleLore].sort((a,b)=>b.ts-a.ts);
  el.innerHTML=`
    <div class="lore-list">
      ${list.map(entry=>`
        <div class="lore-item">
          <div class="lore-head">
            <span class="lore-title">${entry.archetypeName} – Level ${entry.level}</span>
            <span class="lore-time">${new Date(entry.ts).toLocaleTimeString()}</span>
          </div>
          <div class="lore-major">${entry.majorLore}</div>
          ${entry.minorLore.length?`<ul class="lore-minor">${entry.minorLore.map(m=>`<li>${m}</li>`).join('')}</ul>`:''}
        </div>
      `).join('')}
    </div>`;
}

/* ---------- KRØNIKE PAGINATION ---------- */
function updateChronPagination(){
  const totalViews = Math.ceil(CHRON_SECTIONS.length / CHRON_PER_VIEW);
  if(state.chroniclePage >= totalViews) state.chroniclePage = totalViews-1;
  document.getElementById('chron-page-total').textContent = totalViews;
  document.getElementById('chron-page-current').textContent = state.chroniclePage + 1;
  const start = state.chroniclePage * CHRON_PER_VIEW;
  const end = start + CHRON_PER_VIEW;

  document.querySelectorAll('#chronicle-view [data-chron]').forEach(sec=>{
    const id=sec.getAttribute('data-chron');
    const idx=CHRON_SECTIONS.indexOf(id);
    if(idx>=start && idx<end){
      sec.style.display='';
      requestAnimationFrame(()=>{ sec.classList.add('show'); });
    } else {
      sec.style.display='none';
      sec.classList.remove('show');
    }
  });

  document.getElementById('chron-prev').disabled = state.chroniclePage===0;
  document.getElementById('chron-next').disabled = state.chroniclePage>=totalViews-1;
}
document.getElementById('chron-prev').onclick=()=>{
  if(state.chroniclePage>0){ state.chroniclePage--; updateChronPagination(); scheduleSave('chronPage'); }
};
document.getElementById('chron-next').onclick=()=>{
  const totalViews=Math.ceil(CHRON_SECTIONS.length/CHRON_PER_VIEW);
  if(state.chroniclePage<totalViews-1){ state.chroniclePage++; updateChronPagination(); scheduleSave('chronPage'); }
};

/* ---------- PERSISTENCE ---------- */
let _saveTimer=null;
function scheduleSave(reason){
  if(_saveTimer) clearTimeout(_saveTimer);
  _saveTimer=setTimeout(()=>saveState(reason), SAVE_DEBOUNCE_MS);
}
function serialize(){
  return {
    v:4,
    currentView: state.currentView,
    xp: state.xp,
    archetypeXP: state.archetypeXP,
    archetypeLevel: state.archetypeLevel,
    active: state.active,
    completed: state.completed,
    tavleQuests: state.tavleQuests,
    chronicleLore: state.chronicleLore,
    achievementsUnlocked: [...state.achievementsUnlocked],
    chroniclePage: state.chroniclePage
  };
}
function saveState(reason){
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serialize()));
    console.log('[SAVE]', reason);
  } catch(e){ console.warn('Save fejl:', e); }
}
function loadState(){
  try {
    const raw=localStorage.getItem(SAVE_KEY);
    if(!raw) return;
    const data=JSON.parse(raw);
    if(!data || data.v!==4) return;
    state.currentView = data.currentView || 'main';
    state.xp = data.xp ?? state.xp;
    if(data.archetypeXP) Object.assign(state.archetypeXP, data.archetypeXP);
    if(data.archetypeLevel) Object.assign(state.archetypeLevel, data.archetypeLevel);
    if(Array.isArray(data.active)) state.active = data.active;
    if(Array.isArray(data.completed)) state.completed = data.completed;
    if(Array.isArray(data.tavleQuests)) state.tavleQuests = data.tavleQuests;
    if(Array.isArray(data.chronicleLore)) state.chronicleLore = data.chronicleLore;
    if(Array.isArray(data.achievementsUnlocked)) state.achievementsUnlocked = new Set(data.achievementsUnlocked);
    state.chroniclePage = data.chroniclePage || 0;

    // Canonical fix
    [...state.active, ...state.tavleQuests, ...state.completed].forEach(q=>{
      if(q && q.archetype) q.archetype = canonicalArchetypeId(q.archetype);
    });
    console.log('[LOAD] OK');
  } catch(e){ console.warn('Load fejl:', e); }
}

/* ---------- MANUEL GEM KNAP ---------- */
document.getElementById('save-now').onclick = ()=>{
  saveState('manual');
  quickSaveToast();
};
function quickSaveToast(){
  const t=document.createElement('div');
  t.textContent='Gemt';
  Object.assign(t.style,{
    position:'fixed',bottom:'1rem',right:'1rem',
    background:'#25313b',color:'#cfe9f7',
    padding:'8px 14px',border:'1px solid #3c5564',
    borderRadius:'8px',font:'12px/1 system-ui,Arial,sans-serif',
    boxShadow:'0 4px 12px rgba(0,0,0,.45)',
    zIndex:9999,opacity:'0',transform:'translateY(6px)',
    transition:'opacity .35s, transform .35s'
  });
  document.body.appendChild(t);
  requestAnimationFrame(()=>{ t.style.opacity='1'; t.style.transform='translateY(0)'; });
  setTimeout(()=>{
    t.style.opacity='0'; t.style.transform='translateY(6px)';
    setTimeout(()=>t.remove(),420);
  },1300);
}

/* ---------- INITIALISERING ---------- */
loadState();

renderProgressBar();
renderStory();
renderProfile();
renderQuests();
renderActiveQuests();

if(state.currentView==='chronicle'){
  switchView('chronicle'); // render chronicle view
} else {
  switchView('main'); // ensure correct display
}

checkAchievements('initial');
scheduleSave('postInit');

/* ---------- DEBUG ---------- */
window.debugLevelUp = function(id, boost=60){
  id=canonicalArchetypeId(id);
  if(!(id in state.archetypeXP)){ console.warn('Ukendt arketype:', id); return; }
  const before=calcLevel(state.archetypeXP[id]);
  state.archetypeXP[id]+=boost;
  const after=calcLevel(state.archetypeXP[id]);
  for(let L=before+1; L<=after; L++) unlockLoreOrFallback(id, L);
  state.archetypeLevel[id]=after;
  checkAchievements('debugLevel');
  renderProfile();
  if(state.currentView==='chronicle') renderChronicleView();
  scheduleSave('debugLevelUp');
};

/* ---------- ON UNLOAD ---------- */
window.addEventListener('beforeunload', ()=> {
  try { saveState('beforeUnload'); } catch(_){}
});
