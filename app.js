/* Eryndors Lys – app.js v7.3
   Ændringer fra v7.2:
   - Mentor (arketype) overlay viser IKKE længere aktive quests
   - Overlay indeholder nu kun: Info (baggrund + beskrivelse + progress), Achievements relateret til arketypen og Items
   - Ensartet, fast layout-størrelse på mentor overlay for at undgå “hop” / dynamisk højde
   - Mentor-kort (kro-mentorbox) får fast højde så alle er samme størrelse uanset navn/billede
   - Oprydning af kode der tidligere håndterede quest-listen i overlay
*/

import { storyChapters } from './story.js';
import { generateQuestList, updateQuestProgress } from './Questgenerator.js';
import {
  archetypes as archetypesFromRegistry,
  archetypeMap,
  getArchetypeLore,
  getArchetypeImagePath
} from './archetypes.js';

/* ---------- KONSTANTER ---------- */
const SAVE_KEY = 'eryndors_state_v7';
const SAVE_VERSION = 7; // stadig samme datamodel
const SAVE_DEBOUNCE_MS = 400;
const MAX_QUESTS_ON_TAVLE = 6;
const XP_BASE = 50;
const XP_EXPONENT = 1.25;
const levelEmblems = {1:"🔸",2:"✨",3:"⭐",4:"🌟",5:"🌠"};

const LORE_CONFIG = {
  major: { mode: 'popup', archive: true },
  minor: { mode: 'popup', archive: false }
};

const archetypes = archetypesFromRegistry;

/* ---------- GLOBAL FEJL LOGGING ---------- */
window.addEventListener('error', e=>console.error('[GLOBAL ERROR]', e.message, e.error));
window.addEventListener('unhandledrejection', e=>console.error('[UNHANDLED PROMISE]', e.reason));

/* ---------- UTIL ---------- */
function xpRequiredForLevel(l){ return Math.floor(XP_BASE * Math.pow(l, XP_EXPONENT)); }
function xpForLevel(l){ let x=0; for(let i=1;i<l;i++) x+=xpRequiredForLevel(i); return x; }
function calcLevel(x, max=100){ for(let L=1;L<max;L++){ if(x < xpForLevel(L+1)) return L; } return max; }
function calcProgress(x, max=100){
  const L=calcLevel(x,max), b=xpForLevel(L), n=xpForLevel(L+1);
  return Math.min((x-b)/(n-b),1);
}
function getCurrentStoryChapter(){ return calcLevel(state.xp)-1; }

/* ---------- CANONICAL ID ---------- */
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

/* ---------- STATE ---------- */
const state = {
  v: SAVE_VERSION,
  currentView: 'main',
  xp: 0,
  archetypeXP: Object.fromEntries(archetypes.map(a=>[a.id,0])),
  active: [],
  completed: [],
  tavleQuests: generateQuestList(MAX_QUESTS_ON_TAVLE),
  chronicleLore: [],
  achievementsUnlocked: new Set(),
  bookPageIndex: 0,
  minorLoreProgress: {},
  archetypeLevel: Object.fromEntries(archetypes.map(a=>[a.id,1]))
};

/* ---------- ACHIEVEMENTS ---------- */
const achievementDefs = [
  {id:'first_quest', title:'Første Skridt', desc:'Gennemfør 1 quest', check:()=>state.completed.length>=1},
  {id:'ten_quests', title:'Ti i Tasken', desc:'Gennemfør 10 quests', check:()=>state.completed.length>=10},
  {id:'total_xp_500', title:'Stjernelys 500', desc:'Opnå 500 samlet XP', check:()=>state.xp>=500},
  ...archetypes.map(a=>({
    id:`archetype_lvl_3_${a.id}`, title:`${a.name} III`, desc:`Nå level 3 med ${a.name}`,
    check:()=>calcLevel(state.archetypeXP[a.id])>=3,
    archetype: a.id
  }))
];

// Hjælper til at udlede achievements for en specifik arketype
function achievementsForArchetype(aId){
  return achievementDefs.filter(a=>a.archetype === aId);
}

function checkAchievements(reason){
  const newly=[];
  for(const def of achievementDefs){
    if(!state.achievementsUnlocked.has(def.id) && def.check()){
      state.achievementsUnlocked.add(def.id);
      newly.push(def);
      if(state.currentView==='main') showAchievementToast(def);
    }
  }
  if(newly.length){
    if(state.currentView==='chronicle') renderBookPages();
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

/* ---------- LORE PROGRESS ---------- */
function getMinorShownCount(archetypeId, level){
  return state.minorLoreProgress[archetypeId]?.[level] || 0;
}
function setMinorShownCount(archetypeId, level, count){
  if(!state.minorLoreProgress[archetypeId]) state.minorLoreProgress[archetypeId]={};
  state.minorLoreProgress[archetypeId][level]=count;
}
function unlockMajorLore(archetypeId, level){
  if(!LORE_CONFIG.major.archive) return;
  const lore=getArchetypeLore(archetypeId, level);
  if(!lore) return;
  const key=`${archetypeId}_${level}`;
  if(!state.chronicleLore.some(e=>e.id===key)){
    state.chronicleLore.push({
      id:key,
      archetypeId,
      archetypeName: archetypeMap[archetypeId]?.name || archetypeId,
      level,
      majorLore: lore.majorLore,
      ts: Date.now()
    });
  }
}

/* ---------- POPUP KØ ---------- */
const popupQueue = [];
let popupActive = false;
function ensurePopupContainer(){
  if(!document.getElementById('lore-popup-container')){
    const c=document.createElement('div');
    c.id='lore-popup-container';
    c.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:5000;';
    document.body.appendChild(c);
  }
}
function enqueuePopup(builder){
  popupQueue.push(builder);
  if(!popupActive) runNextPopup();
}
function runNextPopup(){
  if(!popupQueue.length){ popupActive=false; return; }
  popupActive=true;
  const builder=popupQueue.shift();
  builder(()=>{ popupActive=false; runNextPopup(); });
}
function basePopupHtml({title, bodyHtml, archetypeId, variant}){
  const bgPath = archetypeId ? getArchetypeImagePath(archetypeId) : null;
  const bgStyle = bgPath ? `style="--arch-bg:url('${bgPath}');"` : '';
  return `
  <div class="lore-popup lore-popup-appear ${variant||''} ${bgPath?'lore-popup--arch':''}"
       ${archetypeId?`data-archetype="${archetypeId}"`:''} ${bgStyle}>
    <button class="lp-close" aria-label="Luk">✖</button>
    <div class="lp-top"><h2 class="lp-title">${title}</h2></div>
    <div class="lp-body">${bodyHtml}</div>
    <div class="lp-actions"><button class="btn primary lp-ok-btn">Fortsæt</button></div>
  </div>`;
}
function queuePopup({title, archetypeId, bodyHtml, variant}){
  enqueuePopup(done=>{
    ensurePopupContainer();
    const container=document.getElementById('lore-popup-container');
    const wrap=document.createElement('div');
    wrap.className='lore-overlay-wrap';
    wrap.innerHTML=basePopupHtml({title, archetypeId, bodyHtml, variant});
    container.appendChild(wrap);
    const popup=wrap.querySelector('.lore-popup');
    void popup.offsetWidth;
    const close=()=>{
      popup.classList.remove('lore-popup-appear');
      popup.classList.add('lore-popup-leave');
      wrap.classList.add('lore-overlay-fade');
      setTimeout(()=>{ wrap.remove(); done(); },310);
    };
    wrap.querySelector('.lp-close').onclick=close;
    wrap.querySelector('.lp-ok-btn').onclick=close;
    wrap.addEventListener('mousedown', e=>{ if(e.target===wrap) close(); });
    window.addEventListener('keydown', function esc(e){
      if(e.key==='Escape'){ close(); window.removeEventListener('keydown', esc); }
    });
  });
}

/* ---------- LORE EVENTS ---------- */
function showMajorLorePopup(archetypeId, level){
  if(LORE_CONFIG.major.mode!=='popup') return;
  const lore=getArchetypeLore(archetypeId, level);
  if(!lore) return;
  queuePopup({
    title:`${archetypeMap[archetypeId]?.name || archetypeId} – Level ${level}`,
    archetypeId,
    variant:'lore-popup--major',
    bodyHtml:`<p class="lp-major">${lore.majorLore}</p>`
  });
}
function showMinorLorePopup(archetypeId, level, line){
  if(LORE_CONFIG.minor.mode!=='popup') return;
  queuePopup({
    title:`${archetypeMap[archetypeId]?.name || archetypeId} – Fragment (Lvl ${level})`,
    archetypeId,
    variant:'lore-popup--minor',
    bodyHtml:`<p class="lp-minor-frag">${line}</p>`
  });
}
function maybeUnlockMinorLore(archetypeId){
  const xp=state.archetypeXP[archetypeId];
  const level=calcLevel(xp);
  const lore=getArchetypeLore(archetypeId, level);
  if(!lore || !Array.isArray(lore.minorLore) || !lore.minorLore.length) return;
  const n=lore.minorLore.length;
  const shown=getMinorShownCount(archetypeId, level);
  if(shown>=n) return;
  const progress=calcProgress(xp);
  for(let i=shown+1;i<=n;i++){
    const threshold=i/(n+1);
    if(progress>=threshold){
      setMinorShownCount(archetypeId, level, i);
      scheduleSave('minorLoreUnlock');
      showMinorLorePopup(archetypeId, level, lore.minorLore[i-1]);
    } else break;
  }
}
function handleLevelUpLore(archetypeId, beforeLevel, afterLevel){
  for(let L=beforeLevel+1; L<=afterLevel; L++){
    unlockMajorLore(archetypeId, L);
    setMinorShownCount(archetypeId, L, 0);
    if(state.currentView==='main') showMajorLorePopup(archetypeId, L);
  }
}
function backfillMajorLore(){
  archetypes.forEach(a=>{
    const xp=state.archetypeXP[a.id];
    const lvl=calcLevel(xp);
    for(let L=2; L<=lvl; L++){
      const key=`${a.id}_${L}`;
      if(!state.chronicleLore.some(e=>e.id===key)){
        unlockMajorLore(a.id, L);
      }
    }
  });
}

/* ---------- DOM / RENDER HELPERS ---------- */
const rootId='app';
function root(){ return document.getElementById(rootId); }
function buildStaticMarkup(){
  const r=root();
  if(!r){ console.error('[INIT] Mangler #app root'); return; }
  r.innerHTML=`
    <div id="main-view" class="view">
      <header class="top-header">
        <h1 class="kro-header">🍻 Eryndors Kro</h1>
      </header>
      <section id="progressbar"></section>
      <section id="story"></section>
      <section id="profile"></section>
      <section id="quests"></section>
      <section id="activequests"></section>
      <button id="chronicle-launcher" class="chronicle-launch pulse" title="Åbn Krøniken">
        <span class="icon">📖</span><span class="label">Krøniken</span>
      </button>
      <div id="mentor-overlay" style="display:none;"></div>
      <div id="lore-popup-container" style="position:fixed;inset:0;pointer-events:none;z-index:5000;"></div>
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
        <div class="book-wrapper">
          <div class="book">
            <div class="book-cover">
              <div class="book-cover-inner">
                <div class="book-logo">📖</div>
                <div class="book-brand">Eryndors Lys</div>
              </div>
            </div>
            <div class="book-spine"></div>
            <div class="book-pages">
              <div class="book-pagination">
                <button id="book-prev" class="btn mini" title="Forrige">⬅</button>
                <div class="page-indicator">
                  <span id="book-page-current">1</span>/<span id="book-page-total">2</span>
                </div>
                <button id="book-next" class="btn mini" title="Næste">➡</button>
              </div>
              <div class="book-spread" id="book-spread"></div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

/* ---------- VIEW SWITCH ---------- */
function setBodyScrollLock(view){
  if(view==='chronicle'){
    document.documentElement.classList.add('lock-scroll');
    document.body.classList.add('lock-scroll');
  } else {
    document.documentElement.classList.remove('lock-scroll');
    document.body.classList.remove('lock-scroll');
  }
}
function switchView(view){
  state.currentView=view;
  const main=document.getElementById('main-view');
  const chron=document.getElementById('chronicle-view');
  if(main) main.style.display = view==='main' ? '' : 'none';
  if(chron) chron.style.display = view==='chronicle' ? '' : 'none';
  setBodyScrollLock(view);
  if(view==='chronicle') renderBookPages();
  scheduleSave('switchView');
}

/* ---------- RENDERING ---------- */
function renderProgressBar(){
  const L=calcLevel(state.xp), p=calcProgress(state.xp);
  const el=document.getElementById('progressbar'); if(!el) return;
  el.innerHTML=`
    <div class="kro-xp-bar-container">
      <span class="kro-xp-emblem">${levelEmblems[L]||''}</span>
      <div class="kro-xp-bar"><div class="kro-xp-bar-fill" style="width:${Math.round(p*100)}%"></div></div>
      <span class="kro-xp-bar-label">Level ${L} / Stjernelys: ${state.xp - xpForLevel(L)} / ${xpRequiredForLevel(L)}</span>
    </div>`;
}
function renderStory(){
  const idx=Math.max(0, Math.min(storyChapters.length-1, getCurrentStoryChapter()));
  const chapter=storyChapters[idx];
  const el=document.getElementById('story'); if(!el) return;
  el.innerHTML=`
    <div class="kro-storybox">
      <h2 class="kro-storytitle">${chapter.title}</h2>
      <div class="kro-storybody">${chapter.text}</div>
    </div>`;
}
function renderProfile(){
  const div=document.getElementById('profile'); if(!div) return;
  div.innerHTML=`
    <div class="kro-profilbox">
      <span class="kro-xp-header">🍺 Stjernelys: <b>${state.xp}</b> 🪙</span>
    </div>
    <div class="kro-mentors">
      <div class="kro-mentors-row">
        ${archetypes.map(a=>{
          const xp=state.archetypeXP[a.id], lv=calcLevel(xp), pr=calcProgress(xp);
          return `<span class="kro-mentorbox" data-mentor="${a.id}">
              <img class="kro-mentor-img" src="${getArchetypeImagePath(a.id)}" alt="${a.name}">
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
  div.querySelectorAll('.kro-mentorbox[data-mentor]').forEach(el=>{
    el.onclick=()=>showMentorOverlay(el.getAttribute('data-mentor'));
  });
}

// Ny: Mentor overlay uden quests, men med achievements og items
function showMentorOverlay(id){
  id=canonicalArchetypeId(id);
  const mentor=archetypes.find(a=>a.id===id);
  if(!mentor) return;
  let overlay=document.getElementById('mentor-overlay');
  if(!overlay){ overlay=document.createElement('div'); overlay.id='mentor-overlay'; document.body.appendChild(overlay); }
  const xp=state.archetypeXP[id];
  const lv=calcLevel(xp);
  const archAchievements = achievementsForArchetype(id);
  const items = mentor.items || mentor.itemList || []; // fleksibel fallback

  const achievementHtml = archAchievements.length
    ? `<div class="mentor-subsection">
         <h4 class="mentor-subtitle">Achievements</h4>
         <div class="mentor-ach-grid">
           ${archAchievements.map(a=>{
              const unlocked = state.achievementsUnlocked.has(a.id);
              return `<div class="mentor-ach-item ${unlocked?'unlocked':''}">
                        <span class="ach-name">${a.title}</span>
                        <span class="ach-status">${unlocked?'✓':'–'}</span>
                        <div class="ach-desc">${a.desc}</div>
                      </div>`;
            }).join('')}
         </div>
       </div>`
    : `<div class="mentor-subsection"><h4 class="mentor-subtitle">Achievements</h4><em>Ingen specifikke achievements.</em></div>`;

  const itemsHtml = items.length
    ? `<div class="mentor-subsection">
         <h4 class="mentor-subtitle">Items</h4>
         <ul class="mentor-items">
           ${items.map(it=>{
              if(typeof it === 'string') return `<li>${it}</li>`;
              if(it && typeof it === 'object'){
                return `<li><b>${it.name||'Ukendt'}</b>${it.desc?` – <span class="item-desc">${it.desc}</span>`:''}</li>`;
              }
              return '<li>Ukendt</li>';
            }).join('')}
         </ul>
       </div>`
    : `<div class="mentor-subsection"><h4 class="mentor-subtitle">Items</h4><em>Ingen items (endnu).</em></div>`;

  overlay.innerHTML=`
    <div class="kro-mentor-overlaybox kro-mentor-overlaybox--with-bg mentor-overlay-fixed" style="--mentor-overlay-bg:url('${getArchetypeImagePath(id)}')">
      <button class="kro-btn kro-close" id="close-mentor-overlay">✖</button>
      <div class="mentor-overlay-columns">
        <div class="mentor-col mentor-col--info">
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
        </div>
        <div class="mentor-col mentor-col--lists">
          ${achievementHtml}
          ${itemsHtml}
        </div>
      </div>
    </div>`;
  overlay.style.cssText='position:fixed;inset:0;background:rgba(32,16,4,0.82);z-index:5500;display:flex;align-items:center;justify-content:center;padding:20px;';
  document.body.classList.add('lock-scroll');
  const closeBtn=document.getElementById('close-mentor-overlay');
  if(closeBtn) closeBtn.onclick=closeMentorOverlay;
  overlay.addEventListener('mousedown', e=>{ if(e.target===overlay) closeMentorOverlay(); });
}

function closeMentorOverlay(){
  const overlay=document.getElementById('mentor-overlay');
  if(overlay){ overlay.style.display='none'; overlay.innerHTML=''; }
  document.body.classList.remove('lock-scroll');
  document.documentElement.classList.remove('lock-scroll');
}

function refillTavleQuests(){
  while(state.tavleQuests.length < MAX_QUESTS_ON_TAVLE){
    const n=generateQuestList(1)[0];
    if(n){
      n.archetype=canonicalArchetypeId(n.archetype);
      state.tavleQuests.push(n);
    }
  }
}
function renderQuests(){
  refillTavleQuests();
  const div=document.getElementById('quests'); if(!div) return;
  div.innerHTML=`<h2 class="kro-questheader">📜 Quests på tavlen</h2><div class="kro-quests"></div>`;
  const wrap=div.querySelector('.kro-quests'); if(!wrap) return;
  wrap.innerHTML='';
  state.tavleQuests.forEach(q=>{
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
  const div=document.getElementById('activequests'); if(!div) return;
  div.innerHTML=`<h2 class="kro-questheader">🎒 Aktive quests</h2><div class="kro-quests"></div>`;
  const wrap=div.querySelector('.kro-quests'); if(!wrap) return;
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
          if(after>before){
            handleLevelUpLore(aId, before, after);
          } else {
            maybeUnlockMinorLore(aId);
          }
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

/* ---------- KRØNIKE ---------- */
const BOOK_PAGE_PAIR = [
  ['stats','achievements'],
  ['completed','lore']
];
function renderBookPages(){
  const spread=document.getElementById('book-spread');
  if(!spread) return;
  const totalPages=BOOK_PAGE_PAIR.length;
  if(state.bookPageIndex>=totalPages) state.bookPageIndex=totalPages-1;
  const cur=document.getElementById('book-page-current');
  const tot=document.getElementById('book-page-total');
  if(cur) cur.textContent=String(state.bookPageIndex+1);
  if(tot) tot.textContent=String(totalPages);
  const pair=BOOK_PAGE_PAIR[state.bookPageIndex];
  spread.innerHTML=pair.map(p=>renderBookPage(p)).join('');
  const prev=document.getElementById('book-prev');
  const next=document.getElementById('book-next');
  if(prev) prev.disabled = state.bookPageIndex===0;
  if(next) next.disabled = state.bookPageIndex===totalPages-1;
}
function renderBookPage(id){
  switch(id){
    case 'stats': return renderStatsPage();
    case 'achievements': return renderAchievementsPage();
    case 'completed': return renderCompletedPage();
    case 'lore': return renderLorePage();
    default: return `<div class="book-page"><h3>Ukendt</h3></div>`;
  }
}
function renderStatsPage(){
  const total=state.completed.length;
  const rows=archetypes.map(a=>{
    const count=state.completed.filter(q=>q.archetype===a.id).length;
    return { name:a.name, count, level:calcLevel(state.archetypeXP[a.id]) };
  });
  return `
    <div class="book-page book-page--stats">
      <h3>Stats</h3>
      <div class="stats-summary">
        <div><b>Total Stjernelys:</b> ${state.xp}</div>
        <div><b>Gennemførte quests:</b> ${total}</div>
      </div>
      <div class="stats-grid">
        ${rows.map(r=>`
          <div class="stat-card">
            <div class="stat-title">${r.name}</div>
            <div class="stat-line"><span>Quests:</span> <b>${r.count}</b></div>
            <div class="stat-line"><span>Level:</span> <b>${r.level}</b></div>
          </div>`).join('')}
      </div>
    </div>`;
}
function renderAchievementsPage(){
  const unlocked=[],locked=[];
  achievementDefs.forEach(d=> state.achievementsUnlocked.has(d.id)?unlocked.push(d):locked.push(d));
  function block(label, arr, ok){
    if(!arr.length) return '';
    return `<div class="ach-block">
      <h4>${label}</h4>
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
  return `<div class="book-page book-page--achievements">
    <h3>Achievements</h3>
    ${block('Åbnet', unlocked, true)}
    ${block('Låste', locked, false)}
  </div>`;
}
function renderCompletedPage(){
  if(!state.completed.length){
    return `<div class="book-page book-page--completed">
      <h3>Gennemførte Quests</h3><em>Ingen endnu.</em>
    </div>`;
  }
  const list=[...state.completed].sort((a,b)=>b.completedAt - a.completedAt);
  return `<div class="book-page book-page--completed">
    <h3>Gennemførte Quests</h3>
    <div class="qtable-wrap">
      <table class="qtable">
        <thead><tr><th>Navn</th><th>Arketype</th><th>XP</th><th>Req lvl</th><th>Type</th><th>Tid</th></tr></thead>
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
    </div>
  </div>`;
}
function renderLorePage(){
  if(!state.chronicleLore.length){
    return `<div class="book-page book-page--lore"><h3>Lore</h3><em>Ingen lore endnu.</em></div>`;
  }
  const list=[...state.chronicleLore].sort((a,b)=>b.ts - a.ts);
  return `<div class="book-page book-page--lore">
    <h3>Lore (Major)</h3>
    <div class="lore-list">
      ${list.map(e=>`
        <div class="lore-item">
          <div class="lore-head">
            <span class="lore-title">${e.archetypeName} – Level ${e.level}</span>
            <span class="lore-time">${new Date(e.ts).toLocaleTimeString()}</span>
          </div>
            <div class="lore-major">${e.majorLore}</div>
        </div>`).join('')}
    </div>
  </div>`;
}

/* ---------- BOOK NAV EVENTS ---------- */
document.addEventListener('click', e=>{
  if(e.target.id==='book-prev'){
    if(state.bookPageIndex>0){
      state.bookPageIndex--;
      renderBookPages(); scheduleSave('bookPage');
    }
  }
  if(e.target.id==='book-next'){
    if(state.bookPageIndex<BOOK_PAGE_PAIR.length-1){
      state.bookPageIndex++;
      renderBookPages(); scheduleSave('bookPage');
    }
  }
});

/* ---------- PERSISTENCE ---------- */
let _saveTimer=null;
function scheduleSave(reason){
  if(_saveTimer) clearTimeout(_saveTimer);
  _saveTimer=setTimeout(()=>saveState(reason), SAVE_DEBOUNCE_MS);
}
function serialize(){
  return {
    v: SAVE_VERSION,
    currentView: state.currentView,
    xp: state.xp,
    archetypeXP: state.archetypeXP,
    active: state.active,
    completed: state.completed,
    tavleQuests: state.tavleQuests,
    chronicleLore: state.chronicleLore,
    achievementsUnlocked: [...state.achievementsUnlocked],
    bookPageIndex: state.bookPageIndex,
    minorLoreProgress: state.minorLoreProgress
  };
}
function saveState(){
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(serialize())); }
  catch(e){ console.warn('Save fejl', e); }
}
function migrateOlderKeys(){
  const oldKeys=['eryndors_state_v6','eryndors_state_v5','eryndors_state_v4','eryndors_state_v3','eryndors_state_v2','eryndors_state_v1'];
  for(const k of oldKeys){
    const raw=localStorage.getItem(k);
    if(!raw) continue;
    try{
      const d=JSON.parse(raw);
      if(!d) continue;
      console.log('[MIGRATION] Importerer', k);
      if(typeof d.xp==='number') state.xp=d.xp;
      if(d.archetypeXP){
        for(const aId in d.archetypeXP){
          const can=canonicalArchetypeId(aId);
            if(state.archetypeXP[can]!=null) state.archetypeXP[can]=d.archetypeXP[aId];
        }
      }
      if(Array.isArray(d.active)) state.active=d.active.map(q=>{ if(q?.archetype) q.archetype=canonicalArchetypeId(q.archetype); return q; });
      if(Array.isArray(d.completed)) state.completed=d.completed.map(q=>{ if(q?.archetype) q.archetype=canonicalArchetypeId(q.archetype); return q; });
      if(Array.isArray(d.tavleQuests)) state.tavleQuests=d.tavleQuests.map(q=>{ if(q?.archetype) q.archetype=canonicalArchetypeId(q.archetype); return q; });
      if(Array.isArray(d.chronicleLore)) state.chronicleLore=d.chronicleLore.map(e=>{ if(e?.archetypeId) e.archetypeId=canonicalArchetypeId(e.archetypeId); return e; });
      if(Array.isArray(d.achievementsUnlocked)) state.achievementsUnlocked=new Set(d.achievementsUnlocked);
      if(typeof d.bookPageIndex==='number') state.bookPageIndex=d.bookPageIndex;
      return true;
    }catch(e){ console.warn('Migration fejl', k, e); }
  }
  return false;
}
function loadState(){
  try{
    const raw=localStorage.getItem(SAVE_KEY);
    if(raw){
      const data=JSON.parse(raw);
      if(data?.v===SAVE_VERSION){
        state.currentView=data.currentView||'main';
        state.xp=data.xp ?? state.xp;
        Object.assign(state.archetypeXP, data.archetypeXP||{});
        if(Array.isArray(data.active)) state.active=data.active;
        if(Array.isArray(data.completed)) state.completed=data.completed;
        if(Array.isArray(data.tavleQuests)) state.tavleQuests=data.tavleQuests;
        if(Array.isArray(data.chronicleLore)) state.chronicleLore=data.chronicleLore;
        if(Array.isArray(data.achievementsUnlocked)) state.achievementsUnlocked=new Set(data.achievementsUnlocked);
        if(typeof data.bookPageIndex==='number') state.bookPageIndex=data.bookPageIndex;
        if(data.minorLoreProgress) state.minorLoreProgress=data.minorLoreProgress;
      } else {
        migrateOlderKeys();
      }
    } else {
      migrateOlderKeys();
    }
    [...state.active, ...state.tavleQuests, ...state.completed].forEach(q=>{
      if(q?.archetype) q.archetype=canonicalArchetypeId(q.archetype);
    });
    archetypes.forEach(a=>{
      state.archetypeLevel[a.id]=calcLevel(state.archetypeXP[a.id]);
    });
    backfillMajorLore();
  }catch(e){ console.warn('Load fejl', e); }
}

/* ---------- MANUEL GEM ---------- */
function quickSaveToast(){
  const t=document.createElement('div');
  t.textContent='Gemt';
  Object.assign(t.style,{
    position:'fixed',bottom:'1rem',right:'1rem',
    background:'#25313b',color:'#cfe9f7',padding:'8px 14px',
    border:'1px solid #3c5564',borderRadius:'8px',font:'12px/1 system-ui,Arial,sans-serif',
    boxShadow:'0 4px 12px rgba(0,0,0,.45)',zIndex:9999,opacity:'0',transform:'translateY(6px)',
    transition:'opacity .35s, transform .35s'
  });
  document.body.appendChild(t);
  requestAnimationFrame(()=>{ t.style.opacity='1'; t.style.transform='translateY(0)'; });
  setTimeout(()=>{
    t.style.opacity='0'; t.style.transform='translateY(6px)';
    setTimeout(()=>t.remove(),420);
  },1300);
}

/* ---------- INIT ---------- */
function init(){
  buildStaticMarkup();
  loadState();
  const chronBtn=document.getElementById('chronicle-launcher');
  if(chronBtn) chronBtn.onclick=()=>switchView('chronicle');
  const backBtn=document.getElementById('back-to-main');
  if(backBtn) backBtn.onclick=()=>switchView('main');
  const saveNow=document.getElementById('save-now');
  if(saveNow) saveNow.onclick=()=>{ saveState('manual'); quickSaveToast(); };

  renderProgressBar();
  renderStory();
  renderProfile();
  renderQuests();
  renderActiveQuests();
  switchView(state.currentView);
  checkAchievements('initial');
  scheduleSave('postInit');

  window.addEventListener('keydown', e=>{
    if(e.key==='Escape'){
      if(state.currentView==='chronicle') switchView('main');
      else closeMentorOverlay();
    }
  });
}
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

window.addEventListener('beforeunload', ()=>{ try{ saveState('beforeUnload'); }catch(_){ } });

/* ---------- DEBUG HELPERS ---------- */
window.debugArchetypeXP = function(id, amount=100){
  id=canonicalArchetypeId(id);
  if(!(id in state.archetypeXP)) return;
  const before=calcLevel(state.archetypeXP[id]);
  state.archetypeXP[id]+=amount;
  const after=calcLevel(state.archetypeXP[id]);
  if(after>before){
    handleLevelUpLore(id, before, after);
  } else {
    maybeUnlockMinorLore(id);
  }
  state.archetypeLevel[id]=after;
  renderProfile();
  scheduleSave('debugArchetypeXP');
};
window.debugAddXP = function(amount=50){
  state.xp += amount;
  renderProgressBar();
  scheduleSave('debugAddXP');
};
