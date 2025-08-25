/* (Uændret header-kommentar beholdt) */
import { storyChapters } from './story.js';
import { generateQuestList, updateQuestProgress } from './Questgenerator.js';
import {
  archetypes as archetypesFromRegistry,
  archetypeMap,
  getArchetypeLore,
  getArchetypeImagePath
} from './archetypes.js';

import {
  ensureProfileStore,
  listProfiles,
  createProfile,
  setActiveProfile,
  getActiveProfileState,
  overwriteActiveProfileState,
  resetActiveProfile,
  deleteProfile,
  updateActiveProfileMeta,
  PRESET_AVATARS,
  getActiveProfile
} from './profiles.js';

/* ---------- KONSTANTER ---------- */
const SAVE_VERSION = 8;
const SAVE_DEBOUNCE_MS = 400;
const MAX_QUESTS_ON_TAVLE = 6;
const XP_BASE = 50;
const XP_EXPONENT = 1.25;
const levelEmblems = {1:"🔸",2:"✨",3:"⭐",4:"🌟",5:"🌠"};
const archetypes = archetypesFromRegistry;

const LORE_CONFIG = {
  major: { mode: 'popup', archive: true },
  minor: { mode: 'popup', archive: false }
};

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
function getPlayerLevel(){ return calcLevel(state.xp); }
function getCurrentStoryChapter(){ return getPlayerLevel()-1; }

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

/* ---------- STATE FACTORY ---------- */
function makeFreshState(){
  return {
    v: SAVE_VERSION,
    currentView: 'main',
    xp: 0,
    archetypeXP: Object.fromEntries(archetypes.map(a=>[a.id,0])),
    archetypeLevel: Object.fromEntries(archetypes.map(a=>[a.id,1])),
    active: [],
    completed: [],
    tavleQuests: [],
    chronicleLore: [],
    achievementsUnlocked: new Set(),
    bookPageIndex: 0,
    minorLoreProgress: {},
    meta: {
      name: 'Karakter',
      avatar: null // runtime avatar (ikke persistent)
    }
  };
}
let state = makeFreshState();

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
function achievementsForArchetype(aId){
  return achievementDefs.filter(a=>a.archetype === aId);
}

/* ---------- ACHIEVEMENT LOGIK ---------- */
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

/* ---------- LORE ---------- */
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

/* ---------- POPUP QUEUE ---------- */
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

/* ---------- DOM MARKUP ---------- */
const rootId='app';
function root(){ return document.getElementById(rootId); }
function buildStaticMarkup(){
  const r=root();
  if(!r){ console.error('[INIT] Mangler #app root'); return; }
  r.innerHTML=`
    <div id="main-view" class="view">
      <header class="top-header">
        <div class="char-header">
          <div class="char-avatar-wrap" id="char-avatar-display"></div>
          <div class="char-name" id="char-name-display"></div>
        </div>
        <h1 class="kro-header">🍻 Eryndors Kro</h1>
        <div class="header-right">
          <button id="switch-profile" class="btn ghost mini">Skift Karakter</button>
        </div>
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
function renderCharacterHeader(){
  const av=document.getElementById('char-avatar-display');
  const nm=document.getElementById('char-name-display');
  if(av){
    if(state.meta.avatar){
      av.innerHTML=`<img src='${state.meta.avatar}' alt='Avatar' class='char-avatar'>`;
    } else {
      av.innerHTML=`<div class="char-avatar placeholder">?</div>`;
    }
  }
  if(nm){
    nm.textContent = state.meta.name || 'Karakter';
  }
}
function renderProgressBar(){
  const L=getPlayerLevel(), p=calcProgress(state.xp);
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
      <button class="btn mini ghost" id="edit-character-btn">Redigér Karakter</button>
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
  const editBtn=document.getElementById('edit-character-btn');
  if(editBtn){
    editBtn.onclick=()=>openCharacterEdit();
  }
}

function rarityBadge(r){
  if(!r || r==='legacy') return '';
  const map={
    common:{c:'#d8d0c0',bg:'#3b352c'},
    uncommon:{c:'#b6e8c7',bg:'#22402b'},
    rare:{c:'#c3d9f7',bg:'#1e2f49'},
    epic:{c:'#f8d28a',bg:'#4a3614'}
  };
  const m=map[r]||map.common;
  return `<span class="quest-rarity quest-rarity--${r}" style="color:${m.c};background:${m.bg};">${r}</span>`;
}

/* ---------- MENTOR OVERLAY ---------- */
function showMentorOverlay(id){
  id=canonicalArchetypeId(id);
  const mentor=archetypes.find(a=>a.id===id);
  if(!mentor) return;
  let overlay=document.getElementById('mentor-overlay');
  if(!overlay){ overlay=document.createElement('div'); overlay.id='mentor-overlay'; document.body.appendChild(overlay); }
  const xp=state.archetypeXP[id];
  const lv=calcLevel(xp);
  const archAchievements = achievementsForArchetype(id);
  const items = mentor.items || mentor.itemList || [];
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
       </div>` : '';
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
       </div>` : '';

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
          ${achievementHtml || '<div class="mentor-subsection"><h4 class="mentor-subtitle">Achievements</h4><em>Ingen specifikke achievements.</em></div>'}
          ${itemsHtml || '<div class="mentor-subsection"><h4 class="mentor-subtitle">Items</h4><em>Ingen items (endnu).</em></div>'}
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

/* ---------- QUESTS ---------- */
function refillTavleQuests(){
  while(state.tavleQuests.length < MAX_QUESTS_ON_TAVLE){
    const n=generateQuestList(1,{
      playerLevel: getPlayerLevel(),
      archetypeLevels: state.archetypeLevel,
      currentProgressCount: state.active.filter(q=>q.type==='progress').length
    })[0];
    if(n){
      n.archetype=canonicalArchetypeId(n.archetype);
      state.tavleQuests.push(n);
    } else break;
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
      <div class="quest-topline">
        <b>${q.name}</b>
        ${rarityBadge(q.rarity)}
      </div>
      <div class="kro-questdesc">${q.desc}</div>
      <div class="kro-questpts">XP: <b>${q.xp}</b> | Type: ${q.type==='progress'?'⏳ progress':'⚡ instant'}</div>
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
      <div class="quest-topline">
        <b>${q.name}</b>
        ${rarityBadge(q.rarity)}
      </div>
      <div class="kro-questdesc">${q.desc}</div>
      <div class="kro-questpts">XP: <b>${q.xp}</b> | Type: ${q.type==='progress'?'⏳ progress':'⚡ instant'}</div>
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
          || (quest.goal && quest.vars && quest.progress >= quest.vars[quest.goal]);
        if(!goalOk) return;
        state.completed.push({
          id:quest.id, name:quest.name, archetype:quest.archetype,
          xp:quest.xp, type:quest.type, levelRequirement:quest.level, completedAt:Date.now(),
          rarity:quest.rarity||''
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
        renderCharacterHeader();
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
        if(quest.goal && quest.vars && quest.progress>=quest.vars[quest.goal]) quest.completed=true;
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
        <thead><tr><th>Navn</th><th>Arketype</th><th>XP</th><th>Rarity</th><th>Type</th><th>Tid</th></tr></thead>
        <tbody>
          ${list.map(q=>`
            <tr>
              <td>${q.name}</td>
              <td>${archetypeMap[q.archetype]?.name||q.archetype||''}</td>
              <td class="num">${q.xp}</td>
              <td>${q.rarity||''}</td>
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

/* ---------- PERSISTENCE VIA PROFILES ---------- */
let _saveTimer=null;
function scheduleSave(reason){
  if(_saveTimer) clearTimeout(_saveTimer);
  _saveTimer=setTimeout(()=>saveState(reason), SAVE_DEBOUNCE_MS);
}

function serializeState(){
  return {
    ...state,
    meta: { ...state.meta, avatar: null },
    achievementsUnlocked: [...state.achievementsUnlocked]
  };
}
function saveState(){
  try {
    overwriteActiveProfileState(serializeState());
  } catch(e){
    console.warn('Save fejl', e);
  }
}
function attachStateFromProfile(){
  const ps = getActiveProfileState();
  const prof = getActiveProfile();
  if(!ps) return false;
  ps.achievementsUnlocked = new Set(ps.achievementsUnlocked || []);
  if(!ps.meta) ps.meta = { name:'Karakter', avatar:null };
  ps.meta.avatar = prof?.avatar || null;
  state = ps;
  return true;
}
function loadState(){ // (Bevares, men bruges ikke længere ved initial visning)
  ensureProfileStore();
  if(!attachStateFromProfile()){
    showProfileSelector();
  } else {
    archetypes.forEach(a=>{
      state.archetypeLevel[a.id] = calcLevel(state.archetypeXP[a.id]);
    });
    backfillMajorLore();
  }
}

/* ---------- BILLEDEKOMPRESSOR ---------- */
async function fileToCompressedDataURL(file, maxSize=96){
  return new Promise((resolve,reject)=>{
    const img = new Image();
    const fr = new FileReader();
    fr.onload = e=>{
      img.onload=()=>{
        const canvas=document.createElement('canvas');
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        canvas.width=w; canvas.height=h;
        const ctx=canvas.getContext('2d');
        ctx.drawImage(img,0,0,w,h);
        let data;
        try {
          data = canvas.toDataURL('image/jpeg', 0.8);
        } catch(_){
          data = canvas.toDataURL('image/png');
        }
        resolve(data);
      };
      img.onerror=()=>reject(new Error('Kan ikke læse billede'));
      img.src = e.target.result;
    };
    fr.onerror=()=>reject(fr.error||new Error('FileReader fejl'));
    fr.readAsDataURL(file);
  });
}

/* ---------- PROFILVALG / CREATION ---------- */
function showProfileSelector(){
  const r=root();
  if(!r){
    console.error('Ingen #app');
    return;
  }
  r.innerHTML = `
    <div class="profile-select-screen">
      <h1>Eryndors Lys</h1>
      <p class="ps-intro">Vælg en eksisterende karakter eller opret en ny.</p>
      <div class="ps-list" id="ps-list"></div>
      <div class="ps-create">
        <h3>Opret ny</h3>
        <label class="ps-label">Navn
          <input id="new-prof-name" placeholder="Navn..." />
        </label>
        <div class="avatar-section">
          <div class="avatar-preset-grid" id="avatar-preset-grid"></div>
          <div class="avatar-upload-block">
            <label class="ps-label">Upload avatar
              <input type="file" id="avatar-upload" accept="image/*" />
            </label>
            <label class="ps-label">Eller URL
              <input id="avatar-url" placeholder="https://..." />
            </label>
          </div>
        </div>
        <div class="chosen-avatar-preview" id="chosen-avatar-preview"></div>
        <button id="create-prof" class="btn primary wide">Opret Karakter</button>
      </div>
    </div>`;
  renderProfileList();
  initAvatarChooser();
  document.getElementById('create-prof').onclick=()=>{
    const name = document.getElementById('new-prof-name').value.trim() || 'Karakter';
    const avatar = currentAvatarSelection || null;
    createProfile(name, avatar, makeFreshState);
    attachStateFromProfile();
    // Tilføjet: recompute archetype-levels + backfill efter profilvalg/oprettelse
    archetypes.forEach(a=>{
      state.archetypeLevel[a.id] = calcLevel(state.archetypeXP[a.id]);
    });
    backfillMajorLore();
    state.meta.name = name;
    state.meta.avatar = avatar;
    initAppAfterProfile();
  };
}

function renderProfileList(){
  const listEl=document.getElementById('ps-list');
  if(!listEl) return;
  const profiles=listProfiles();
  if(!profiles.length){
    listEl.innerHTML='<em>Ingen karakterer endnu.</em>';
    return;
  }
  listEl.innerHTML=profiles.map(p=>`
    <div class="ps-item" data-pid="${p.id}">
      <div class="ps-left">
        <div class="ps-avatar">${p.avatar?`<img src='${p.avatar}' alt=''>`:'<span class="ps-avatar-placeholder">?</span>'}</div>
        <div class="ps-info">
          <div class="ps-name">${p.name}</div>
          <div class="ps-meta">XP: ${p.xp}</div>
        </div>
      </div>
      <div class="ps-item-actions">
        <button class="btn mini" data-load="${p.id}">Spil</button>
        <button class="btn mini danger" data-del="${p.id}">Slet</button>
      </div>
    </div>`).join('');
  listEl.querySelectorAll('[data-load]').forEach(btn=>{
    btn.onclick=()=>{
      if(setActiveProfile(btn.getAttribute('data-load'))){
        attachStateFromProfile();
        // Tilføjet: recompute + backfill her også
        archetypes.forEach(a=>{
          state.archetypeLevel[a.id] = calcLevel(state.archetypeXP[a.id]);
        });
        backfillMajorLore();
        initAppAfterProfile();
      }
    };
  });
  listEl.querySelectorAll('[data-del]').forEach(btn=>{
    btn.onclick=()=>{
      const pid=btn.getAttribute('data-del');
      if(confirm('Slet denne karakter permanent?')){
        deleteProfile(pid);
        renderProfileList();
      }
    };
  });
}

/* ---------- AVATARVALG ---------- */
let currentAvatarSelection = null;

function initAvatarChooser(){
  const grid=document.getElementById('avatar-preset-grid');
  const preview=document.getElementById('chosen-avatar-preview');
  if(grid){
    grid.innerHTML = PRESET_AVATARS.map(a=>`
      <button class="avatar-choice" data-avatar="${a.src}" title="${a.label}">
        <img src='${a.src}' alt='${a.label}'>
      </button>`).join('');
    grid.querySelectorAll('.avatar-choice').forEach(btn=>{
      btn.onclick=()=>{
        currentAvatarSelection = btn.getAttribute('data-avatar');
        updateChosenPreview(preview);
      };
    });
  }
  const up=document.getElementById('avatar-upload');
  if(up){
    up.onchange=async ()=>{
      const f=up.files?.[0];
      if(f){
        try {
          currentAvatarSelection = await fileToCompressedDataURL(f,96);
        } catch(e){
          console.warn('Komprimeringsfejl', e);
          const reader=new FileReader();
          reader.onload=ev=> currentAvatarSelection = ev.target.result;
          reader.readAsDataURL(f);
        } finally {
          updateChosenPreview(preview);
        }
      }
    };
  }
  const urlInput=document.getElementById('avatar-url');
  if(urlInput){
    urlInput.onchange=()=>{
      const val=urlInput.value.trim();
      if(val){
        currentAvatarSelection=val;
        updateChosenPreview(preview);
      }
    };
  }
}
function updateChosenPreview(preview){
  if(!preview) return;
  if(currentAvatarSelection){
    preview.innerHTML=`<div class="chosen-label">Valgt Avatar:</div><img src='${currentAvatarSelection}' alt='Valgt' class='chosen-avatar-img'>`;
  } else {
    preview.innerHTML=`<em>Ingen avatar valgt</em>`;
  }
}

/* ---------- KARAKTER REDIGERING ---------- */
function openCharacterEdit(){
  const wrap=document.createElement('div');
  wrap.className='char-edit-overlay';
  wrap.innerHTML=`
    <div class="char-edit-modal">
      <button class="char-edit-close" aria-label="Luk">✖</button>
      <h3>Redigér Karakter</h3>
      <label>Navn
        <input id="edit-char-name" value="${state.meta.name||''}" />
      </label>
      <div class="char-edit-avatar-block">
        <div class="char-current-avatar">${state.meta.avatar?`<img src='${state.meta.avatar}' alt=''>`:'<span class="ps-avatar-placeholder large">?</span>'}</div>
        <div class="char-avatar-actions">
          <div class="mini-avatar-grid">
            ${PRESET_AVATARS.map(a=>`
              <button class="mini-avatar-btn" data-mini-avatar="${a.src}" title="${a.label}">
                <img src='${a.src}' alt='${a.label}'>
              </button>`).join('')}
          </div>
          <label class="upload-inline">
            Upload <input type="file" id="edit-avatar-upload" accept="image/*" hidden>
          </label>
            <input id="edit-avatar-url" placeholder="Avatar URL..." />
        </div>
      </div>
      <div class="char-edit-actions">
        <button class="btn primary" id="char-edit-save">Gem</button>
        <button class="btn danger" id="char-edit-reset">Nulstil karakter (XP=0)</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  let tempAvatar = state.meta.avatar || null;

  wrap.querySelectorAll('[data-mini-avatar]').forEach(btn=>{
    btn.onclick=()=>{
      tempAvatar=btn.getAttribute('data-mini-avatar');
      updateTempAvatar();
    };
  });
  function updateTempAvatar(){
    const cur=wrap.querySelector('.char-current-avatar');
    if(cur) cur.innerHTML = tempAvatar?`<img src='${tempAvatar}' alt=''>`:'<span class="ps-avatar-placeholder large">?</span>';
  }
  const fileInput=wrap.querySelector('#edit-avatar-upload');
  const uploadLabel=wrap.querySelector('.upload-inline');
  if(uploadLabel){
    uploadLabel.onclick=()=> fileInput?.click();
  }
  if(fileInput){
    fileInput.onchange=async ()=>{
      const f=fileInput.files?.[0];
      if(f){
        try {
          tempAvatar = await fileToCompressedDataURL(f,96);
        } catch(e){
          console.warn('Komprimering fejlede', e);
          const reader=new FileReader();
          reader.onload=ev=>{ tempAvatar=ev.target.result; updateTempAvatar(); };
          reader.readAsDataURL(f);
          return;
        }
        updateTempAvatar();
      }
    };
  }
  const urlInput=wrap.querySelector('#edit-avatar-url');
  if(urlInput){
    urlInput.onchange=()=>{
      const val=urlInput.value.trim();
      if(val){ tempAvatar=val; updateTempAvatar(); }
    };
  }
  wrap.querySelector('.char-edit-close').onclick=()=>wrap.remove();
  wrap.addEventListener('mousedown', e=>{ if(e.target===wrap) wrap.remove(); });

  wrap.querySelector('#char-edit-save').onclick=()=>{
    const newName = (wrap.querySelector('#edit-char-name').value.trim()) || 'Karakter';
    state.meta.name = newName;
    state.meta.avatar = tempAvatar;
    updateActiveProfileMeta({ name:newName, avatar: tempAvatar });
    renderCharacterHeader();
    renderProfile();
    scheduleSave('charEdit');
    wrap.remove();
  };
  wrap.querySelector('#char-edit-reset').onclick=()=>{
    if(confirm('Nulstil denne karakter til 0 XP og tom historik?')){
      resetActiveProfile(makeFreshState);
      attachStateFromProfile();
      state.meta.name = tempAvatar ? state.meta.name : state.meta.name;
      state.meta.avatar = tempAvatar;
      updateActiveProfileMeta({ avatar: tempAvatar });
      renderAll();
      scheduleSave('charSoftReset');
      wrap.remove();
    }
  };
}

/* ---------- FULL RENDER ---------- */
function renderAll(){
  renderCharacterHeader();
  renderProgressBar();
  renderStory();
  renderProfile();
  renderQuests();
  renderActiveQuests();
  switchView(state.currentView);
  checkAchievements('renderAll');
}

/* ---------- INIT EFTER PROFIL ---------- */
function initAppAfterProfile(){
  buildStaticMarkup();
  // generér første tavle hvis tom
  if(!state.tavleQuests.length){
    state.tavleQuests = generateQuestList(
      MAX_QUESTS_ON_TAVLE,
      { playerLevel: getPlayerLevel(), archetypeLevels: state.archetypeLevel }
    );
  }
  hookGlobalUI();
  renderAll();
  scheduleSave('initAfterProfile');
}

/* ---------- UI HOOKS ---------- */
function hookGlobalUI(){
  const chronBtn=document.getElementById('chronicle-launcher');
  if(chronBtn) chronBtn.onclick=()=>switchView('chronicle');
  const backBtn=document.getElementById('back-to-main');
  if(backBtn) backBtn.onclick=()=>switchView('main');
  const saveNow=document.getElementById('save-now');
  if(saveNow) saveNow.onclick=()=>{ saveState('manual'); quickSaveToast(); };
  const switchBtn=document.getElementById('switch-profile');
  if(switchBtn){
    switchBtn.onclick=()=>{
      saveState();
      showProfileSelector();
    };
  }
  const resetBtn=document.createElement('button');
  resetBtn.textContent='Nulstil karakter';
  resetBtn.className='btn danger mini char-reset-btn';
  resetBtn.onclick=()=>{
    if(confirm('Nulstil denne karakter helt?')){
      resetActiveProfile(makeFreshState);
      attachStateFromProfile();
      renderAll();
      scheduleSave('resetProfile');
    }
  };
  document.body.appendChild(resetBtn);
}

/* ---------- QUICK SAVE TOAST ---------- */
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

/* ---------- INIT (ændret: altid profilvælger) ---------- */
function init(){
  ensureProfileStore();
  showProfileSelector(); // Altid vis ved opstart
  // loadState(); // (Ikke længere kaldt – beholdt hvis du senere vil tilbage)
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
