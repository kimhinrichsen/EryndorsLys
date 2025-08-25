import { storyChapters } from './story.js';
import { generateQuestList, updateQuestProgress } from './Questgenerator.js';
import { archetypes as archetypesFromRegistry, archetypeMap, getArchetypeLore } from './archetypes.js';

/* ==============================
   KONSTANTER & HJÆLPEFUNKTIONER
   ============================== */
const archetypes = archetypesFromRegistry;
const levelEmblems = { 1:"🔸", 2:"✨", 3:"⭐", 4:"🌟", 5:"🌠" };
const MAX_QUESTS_ON_TAVLE = 6;
const XP_BASE = 50;
const XP_EXPONENT = 1.25;

function xpRequiredForLevel(l){ return Math.floor(XP_BASE * Math.pow(l, XP_EXPONENT)); }
function xpForLevel(l){ let x=0; for(let i=1;i<l;i++) x+=xpRequiredForLevel(i); return x; }
function calcLevel(x, max=100){ for(let L=1;L<max;L++){ if(x<xpForLevel(L+1)) return L; } return max; }
function calcProgress(x, max=100){
  const L=calcLevel(x,max); const b=xpForLevel(L); const n=xpForLevel(L+1);
  return Math.min((x-b)/(n-b),1);
}
function getCurrentStoryChapter(){ return calcLevel(state.xp)-1; }

/* ==============================
   STATE
   ============================== */
const state = {
  xp: 0,
  archetypeXP: Object.fromEntries(archetypes.map(a => [a.id, 0])),
  archetypeLevel: Object.fromEntries(archetypes.map(a => [a.id, 1])),
  active: [],
  completed: [],
  tavleQuests: generateQuestList(MAX_QUESTS_ON_TAVLE),
  chronicleLore: [],
  achievementsUnlocked: new Set()
};

/* ==============================
   CANONICAL NORMALISERING
   ============================== */
const _archetypeCanonicalIndex = (() => {
  function norm(str){
    return (str||'').toString().trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,'');
  }
  const map={};
  (archetypes||[]).forEach(a=>{
    map[norm(a.id)] = a.id;
    map[norm(a.name)] = a.id;
  });
  return { norm, map };
})();
function canonicalArchetypeId(raw){
  if(!raw) return null;
  const n=_archetypeCanonicalIndex.norm(raw);
  return _archetypeCanonicalIndex.map[n] || raw;
}

// Normaliser eksisterende quests
state.tavleQuests.forEach(q => { q.archetype = canonicalArchetypeId(q.archetype); });

/* ==============================
   ACHIEVEMENTS
   ============================== */
const achievementDefs = [
  { id:'first_quest', title:'Første Skridt', desc:'Gennemfør 1 quest', check:()=>state.completed.length>=1 },
  { id:'ten_quests', title:'Ti i Tasken', desc:'Gennemfør 10 quests', check:()=>state.completed.length>=10 },
  { id:'total_xp_500', title:'Stjernelys 500', desc:'Opnå 500 samlet XP', check:()=>state.xp>=500 },
  ...archetypes.map(a=>({
    id:`archetype_lvl_3_${a.id}`,
    title:`${a.name} III`,
    desc:`Nå level 3 med ${a.name}`,
    check:()=>calcLevel(state.archetypeXP[a.id])>=3
  }))
];

function checkAchievements(){
  let updated=false;
  for(const def of achievementDefs){
    if(!state.achievementsUnlocked.has(def.id) && def.check()){
      state.achievementsUnlocked.add(def.id);
      updated=true;
      showAchievementToast(def);
    }
  }
  if(updated) renderChronicleSections(); // opdatér bundbog
}

function showAchievementToast(def){
  const box=document.createElement('div');
  box.className='kro-achievement-toast';
  box.innerHTML=`<strong>Achievement:</strong> ${def.title}<br><span>${def.desc}</span>`;
  Object.assign(box.style,{
    position:'fixed', bottom:'1rem', left:'1rem',
    background:'#222C', color:'#eee', padding:'10px 14px',
    border:'1px solid #555', borderRadius:'8px',
    font:'13px/1.35 system-ui,Arial,sans-serif',
    zIndex:9999, backdropFilter:'blur(4px)', maxWidth:'260px',
    opacity:'0', transform:'translateY(8px)', transition:'opacity .35s, transform .35s'
  });
  document.body.appendChild(box);
  requestAnimationFrame(()=>{ box.style.opacity='1'; box.style.transform='translateY(0)'; });
  setTimeout(()=>{
    box.style.opacity='0'; box.style.transform='translateY(8px)';
    setTimeout(()=>box.remove(),400);
  },4500);
}

/* ==============================
   LORE (LEVEL-UP)
   ============================== */
function unlockLoreOrFallback(archetypeId, level){
  const lore = getArchetypeLore(archetypeId, level);
  if(!lore){
    showLorePopup({
      archetypeName: archetypeMap[archetypeId]?.name || archetypeId,
      level,
      majorLore:'(Ingen lore endnu – men du steg i niveau!)',
      minorLore:[]
    });
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
  showLorePopup({
    archetypeName: archetypeMap[archetypeId]?.name || archetypeId,
    level,
    majorLore:lore.majorLore,
    minorLore:lore.minorLore||[]
  });
  renderChronicleSections(); // opdatér bogen
}

function showLorePopup(entry){
  // Popup vises midt på skærmen
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
    background:rgba(15,18,25,0.55);backdrop-filter:blur(4px);pointer-events:auto;
    animation:fadeIn .25s;z-index:5001;
  `;
  wrap.innerHTML=`
    <div style="background:#1d1f24;color:#eee;max-width:540px;width:clamp(300px,70%,540px);
      border:1px solid #444;border-radius:16px;padding:26px 30px;
      font:14px/1.45 system-ui,Arial,sans-serif;position:relative;
      box-shadow:0 8px 32px rgba(0,0,0,.55);">
      <button id="close-lore-popup" style="
        position:absolute;top:10px;right:12px;background:#333;color:#ccc;
        border:1px solid #555;border-radius:4px;cursor:pointer;padding:3px 7px;">✖</button>
      <h2 style="margin:0 0 8px;font-size:20px;">${entry.archetypeName} – Level ${entry.level}</h2>
      <p style="margin:0 0 14px;font-weight:600;">${entry.majorLore}</p>
      ${entry.minorLore.length?`<ul style="margin:0 0 16px 20px;padding:0;">${entry.minorLore.map(m=>`<li>${m}</li>`).join('')}</ul>`:''}
      <div style="text-align:right;">
        <button id="dismiss-lore" style="
          background:#2e4b7a;color:#fff;border:1px solid #476694;border-radius:6px;
          padding:7px 14px;cursor:pointer;font-size:13px;">Luk</button>
      </div>
    </div>
  `;
  container.appendChild(wrap);
  const close=()=>{ wrap.style.opacity='0'; wrap.style.transition='opacity .25s'; setTimeout(()=>wrap.remove(),220); };
  wrap.querySelector('#close-lore-popup').onclick=close;
  wrap.querySelector('#dismiss-lore').onclick=close;
}

/* ==============================
   DOM SKELETON
   ============================== */
document.body.innerHTML = `
  <div id="app-root">
    <header class="kro-topbar">
      <h1 class="kro-header">🍻 Eryndors Kro</h1>
      <div class="kro-topbar-buttons">
        <button id="scroll-chronicle" class="kro-btn kro-btn-ghost">📖 Krøniken</button>
      </div>
    </header>
    <main id="main-content">
      <section id="progressbar"></section>
      <section id="story"></section>
      <section id="profile"></section>
      <section id="quests"></section>
      <section id="activequests"></section>
      <section id="chronicle-book-wrapper">
        <!-- Krøniken (bog) genereres nedenfor -->
        <div id="chronicle-book" class="chron-book">
          <div class="chron-book-cover">
            <div class="chron-book-cover-inner">
              <div class="chron-book-title">
                <span class="chron-book-icon">📖</span>
                <span>Krøniken</span>
              </div>
              <div class="chron-book-sub">Eryndors Lys</div>
            </div>
          </div>
          <div class="chron-book-spine"></div>
          <div class="chron-book-pages">
            <div class="chron-page-grid">
              <div class="chron-page chron-page--stats">
                <h2>Stats</h2>
                <div id="chron-stats"></div>
              </div>
              <div class="chron-page chron-page--ach">
                <h2>Achievements</h2>
                <div id="chron-achievements"></div>
              </div>
              <div class="chron-page chron-page--quests">
                <h2>Gennemførte Quests</h2>
                <div id="chron-completed"></div>
              </div>
              <div class="chron-page chron-page--lore">
                <h2>Lore</h2>
                <div id="chron-lore"></div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
    <div id="mentor-overlay" style="display:none;"></div>
    <div id="lore-popup-container" style="position:fixed;inset:0;pointer-events:none;z-index:5000;"></div>
  </div>
`;

/* Scroll knap */
document.getElementById('scroll-chronicle').onclick = () => {
  document.getElementById('chronicle-book-wrapper')?.scrollIntoView({behavior:'smooth'});
};

/* ==============================
   RENDER FUNKTIONER (MAIN DEL)
   ============================== */
function renderProgressBar(){
  const totalL=calcLevel(state.xp);
  const prog=calcProgress(state.xp);
  document.getElementById('progressbar').innerHTML = `
    <div class="kro-xp-bar-container">
      <span class="kro-xp-emblem">${levelEmblems[totalL]||''}</span>
      <div class="kro-xp-bar"><div class="kro-xp-bar-fill" style="width:${Math.round(prog*100)}%"></div></div>
      <span class="kro-xp-bar-label">Level ${totalL} / XP: ${state.xp - xpForLevel(totalL)} / ${xpRequiredForLevel(totalL)}</span>
    </div>
  `;
}

function renderStory(){
  const idx=Math.max(0, Math.min(storyChapters.length-1, getCurrentStoryChapter()));
  const chapter=storyChapters[idx];
  document.getElementById('story').innerHTML = `
    <div class="kro-storybox">
      <h2 class="kro-storytitle">${chapter.title}</h2>
      <div class="kro-storybody">${chapter.text}</div>
    </div>
  `;
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
          const xp=state.archetypeXP[a.id];
          const lv=calcLevel(xp);
          const pr=calcProgress(xp);
          return `
            <span class="kro-mentorbox" data-mentor="${a.id}">
              <span class="kro-mentor-main">${a.icon||''} <b>${a.name}</b></span>
              <span class="kro-mentor-progressbar">
                <span class="kro-mentor-emblem">${levelEmblems[lv]||''}</span>
                <div class="kro-mentor-bar"><div class="kro-mentor-bar-fill" style="width:${Math.round(pr*100)}%"></div></div>
                <span class="kro-mentor-bar-label">Level ${lv}</span>
              </span>
            </span>
          `;
        }).join('')}
      </div>
    </div>
  `;
  div.querySelectorAll('[data-mentor]').forEach(el=> el.onclick=()=>showMentorOverlay(el.getAttribute('data-mentor')));
}

function showMentorOverlay(id){
  id=canonicalArchetypeId(id);
  const mentor=archetypes.find(a=>a.id===id);
  if(!mentor) return;
  const overlay=document.getElementById('mentor-overlay');
  const mentorQuests=state.tavleQuests.concat(state.active).filter(q=>q.archetype===id && !q.completed);
  const xp=state.archetypeXP[id];
  const lv=calcLevel(xp);
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
      <h3>Achievements</h3>
      <div class="kro-mentor-achievements"><em>Ikke pr. mentor endnu.</em></div>
      <h3>Badges</h3>
      <div class="kro-mentor-badges"><em>Ingen badges endnu.</em></div>
      <hr/>
      <div class="kro-mentor-overlay-quests">
        <h3 style="margin-top:0;">Quests hos ${mentor.name}</h3>
        ${mentorQuests.length===0?'<i>Ingen åbne quests hos denne mentor.</i>':
          mentorQuests.map(q=>`
            <div class="kro-questroll">
              <b>${q.name}</b>
              <div class="kro-questdesc">${q.desc}</div>
              <div class="kro-questpts">XP: <b>${q.xp}</b> | Kravniveau: ${q.level}</div>
              ${q.type==='progress'?`<div>Fremgang: ${q.progress} / ${q.vars[q.goal]}</div>`:''}
            </div>`).join('')}
      </div>
    </div>
  `;
  overlay.style.display='flex';
  document.getElementById('close-mentor-overlay').onclick=()=>{ overlay.style.display='none'; overlay.innerHTML=''; };
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
  div.innerHTML=`
    <h2 class="kro-questheader">📜 Quests på tavlen</h2>
    <div class="kro-quests"></div>`;
  const wrap=div.querySelector('.kro-quests');
  wrap.innerHTML='';
  state.tavleQuests.forEach(q=>{
    if(!q) return;
    const progressHtml=q.type==='progress'
      ? `<div class="kro-quest-progress">
           Fremgang: ${q.progress} / ${q.vars[q.goal]}
           <button class="kro-btn" data-progress="${q.id}">+1</button>
         </div>` : '';
    const el=document.createElement('div');
    el.className='kro-questroll';
    el.innerHTML=`
      <span class="kro-questicon">${q.icon||''}</span>
      <b>${q.name}</b>
      <div class="kro-questdesc">${q.desc}</div>
      <div class="kro-questpts">
        XP: <b>${q.xp}</b> | Niveau: ${q.level} ${levelEmblems[q.level]||''}
      </div>
      ${progressHtml}
      <button class="kro-btn" data-accept="${q.id}">Acceptér quest</button>
    `;
    wrap.appendChild(el);
  });

  wrap.querySelectorAll('[data-accept]').forEach(btn=>{
    btn.onclick=()=>{
      const id=btn.getAttribute('data-accept');
      const idx=state.tavleQuests.findIndex(q=>q.id===id);
      if(idx>=0){
        state.active.push(state.tavleQuests[idx]);
        state.tavleQuests.splice(idx,1);
        renderQuests(); renderActiveQuests();
      }
    };
  });
  wrap.querySelectorAll('[data-progress]').forEach(btn=>{
    btn.onclick=()=>{
      const id=btn.getAttribute('data-progress');
      const quest=state.tavleQuests.find(q=>q.id===id);
      if(quest){ updateQuestProgress(quest,1); renderQuests(); }
    };
  });
}

function renderActiveQuests(){
  const div=document.getElementById('activequests');
  div.innerHTML=`
    <h2 class="kro-questheader">🎒 Aktive quests</h2>
    <div class="kro-quests"></div>`;
  const wrap=div.querySelector('.kro-quests');
  wrap.innerHTML='';
  state.active.forEach(q=>{
    if(!q) return;
    const progressHtml=q.type==='progress'
      ? `<div class="kro-quest-progress">
           Fremgang: ${q.progress} / ${q.vars[q.goal]}
           <button class="kro-btn" data-progress-active="${q.id}">+1</button>
         </div>` : '';
    const el=document.createElement('div');
    el.className='kro-questroll';
    el.innerHTML=`
      <span class="kro-questicon">${q.icon||''}</span>
      <b>${q.name}</b>
      <div class="kro-questdesc">${q.desc}</div>
      <div class="kro-questpts">
        XP: <b>${q.xp}</b> | Niveau: ${q.level} ${levelEmblems[q.level]||''}
      </div>
      ${progressHtml}
      <div class="kro-quest-actions">
        <button class="kro-btn" data-complete="${q.id}">Gennemfør</button>
        <button class="kro-btn kro-drop" data-drop="${q.id}">Drop</button>
      </div>
    `;
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
        // registrer
        state.completed.push({
          id:quest.id, name:quest.name, archetype:quest.archetype,
          xp:quest.xp, type:quest.type, levelRequirement:quest.level, completedAt:Date.now()
        });
        state.xp += quest.xp;
        const aId = canonicalArchetypeId(quest.archetype);
        if(aId && state.archetypeXP[aId]!=null){
          const before=calcLevel(state.archetypeXP[aId]);
          state.archetypeXP[aId]+=quest.xp;
          const after=calcLevel(state.archetypeXP[aId]);
          for(let L=before+1; L<=after; L++) unlockLoreOrFallback(aId, L);
          state.archetypeLevel[aId]=after;
        }
        state.active.splice(idx,1);
        checkAchievements();
        renderProgressBar(); renderStory(); renderProfile(); renderQuests(); renderActiveQuests(); renderChronicleSections();
      }
    };
  });

  wrap.querySelectorAll('[data-drop]').forEach(btn=>{
    btn.onclick=()=>{
      const id=btn.getAttribute('data-drop');
      const idx=state.active.findIndex(q=>q.id===id);
      if(idx>=0){ state.active.splice(idx,1); renderActiveQuests(); renderQuests(); }
    };
  });

  wrap.querySelectorAll('[data-progress-active]').forEach(btn=>{
    btn.onclick=()=>{
      const id=btn.getAttribute('data-progress-active');
      const quest=state.active.find(q=>q.id===id);
      if(quest){
        updateQuestProgress(quest,1);
        if(quest.vars && quest.goal && quest.progress>=quest.vars[quest.goal]) quest.completed=true;
        renderActiveQuests();
      }
    };
  });
}

/* ==============================
   KRØNIKE (BOG) NEDERST
   ============================== */
function renderChronicleSections(){
  renderChronStats();
  renderChronAchievements();
  renderChronCompleted();
  renderChronLore();
}

/* Stats */
function renderChronStats(){
  const el=document.getElementById('chron-stats');
  if(!el) return;
  const total=state.completed.length;
  const by={};
  archetypes.forEach(a=>{
    const count=state.completed.filter(q=>q.archetype===a.id).length;
    by[a.id]={name:a.name,count,level:calcLevel(state.archetypeXP[a.id])};
  });
  el.innerHTML=`
    <div class="chron-stats-summary">
      <div><b>Total XP:</b> ${state.xp}</div>
      <div><b>Gennemførte quests:</b> ${total}</div>
    </div>
    <div class="chron-stats-grid">
      ${Object.values(by).map(o=>`
        <div class="chron-stat-card">
          <div class="chron-stat-title">${o.name}</div>
          <div class="chron-stat-line"><span>Quests:</span> <b>${o.count}</b></div>
          <div class="chron-stat-line"><span>Level:</span> <b>${o.level}</b></div>
        </div>
      `).join('')}
    </div>
  `;
}

/* Achievements */
function renderChronAchievements(){
  const el=document.getElementById('chron-achievements');
  if(!el) return;
  const unlocked=[], locked=[];
  achievementDefs.forEach(d => state.achievementsUnlocked.has(d.id)?unlocked.push(d):locked.push(d));
  function block(title, arr, ok){
    if(!arr.length) return '';
    return `
      <div class="chron-ach-block">
        <h3>${title}</h3>
        <div class="chron-ach-grid">
          ${arr.map(a=>`
            <div class="chron-ach-item ${ok?'chron-ach-item--unlocked':''}">
              <div class="chron-ach-title">${a.title}</div>
              <div class="chron-ach-desc">${a.desc}</div>
              <div class="chron-ach-status">${ok?'✓':'Låst'}</div>
            </div>`).join('')}
        </div>
      </div>
    `;
  }
  el.innerHTML = block('Åbnet', unlocked, true) + block('Låste', locked, false);
}

/* Completed quests */
function renderChronCompleted(){
  const el=document.getElementById('chron-completed');
  if(!el) return;
  if(!state.completed.length){
    el.innerHTML='<em>Ingen quests gennemført endnu.</em>';
    return;
  }
  const list=[...state.completed].sort((a,b)=>b.completedAt - a.completedAt);
  el.innerHTML=`
    <div class="chron-quests-tablewrap">
      <table class="chron-quests-table">
        <thead>
          <tr>
            <th>Navn</th>
            <th>Arketype</th>
            <th>XP</th>
            <th>Req lvl</th>
            <th>Type</th>
            <th>Tidspunkt</th>
          </tr>
        </thead>
        <tbody>
        ${list.map(q=>`
          <tr>
            <td>${q.name}</td>
            <td>${archetypeMap[q.archetype]?.name || q.archetype || ''}</td>
            <td class="num">${q.xp}</td>
            <td class="num">${q.levelRequirement ?? ''}</td>
            <td>${q.type||''}</td>
            <td>${new Date(q.completedAt).toLocaleString()}</td>
          </tr>
        `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/* Lore */
function renderChronLore(){
  const el=document.getElementById('chron-lore');
  if(!el) return;
  if(!state.chronicleLore.length){
    el.innerHTML='<em>Ingen lore låst op endnu.</em>';
    return;
  }
  const list=[...state.chronicleLore].sort((a,b)=>b.ts-a.ts);
  el.innerHTML=`
    <div class="chron-lore-list">
      ${list.map(entry=>`
        <div class="chron-lore-item">
          <div class="chron-lore-head">
            <span class="chron-lore-title">${entry.archetypeName} – Level ${entry.level}</span>
            <span class="chron-lore-time">${new Date(entry.ts).toLocaleTimeString()}</span>
          </div>
          <div class="chron-lore-major">${entry.majorLore}</div>
          ${entry.minorLore.length?`<ul class="chron-lore-minor">${entry.minorLore.map(m=>`<li>${m}</li>`).join('')}</ul>`:''}
        </div>
      `).join('')}
    </div>
  `;
}

/* ==============================
   INITIAL RENDER
   ============================== */
renderProgressBar();
renderStory();
renderProfile();
renderQuests();
renderActiveQuests();
renderChronicleSections();
checkAchievements();

/* ==============================
   DIAGNOSTIK
   ============================== */
(function diagnoser(){
  const regIds=Object.keys(archetypeMap);
  const questIds=[
    ...state.tavleQuests.map(q=>q.archetype),
    ...state.active.map(q=>q.archetype)
  ].filter(Boolean);
  const unknown=[...new Set(questIds.filter(id=>!regIds.includes(id)))];
  if(unknown.length) console.warn('[DIAG] Ukendte arketype-id i quests:', unknown);
})();

/* DEBUG (valgfrit) */
window.debugLevelUp = function(id, boost=60){
  id=canonicalArchetypeId(id);
  if(!(id in state.archetypeXP)){ console.warn('Ukendt arketype:', id); return; }
  const before=calcLevel(state.archetypeXP[id]);
  state.archetypeXP[id]+=boost;
  const after=calcLevel(state.archetypeXP[id]);
  for(let L=before+1; L<=after; L++) unlockLoreOrFallback(id, L);
  state.archetypeLevel[id]=after;
  checkAchievements();
  renderProfile();
  renderChronicleSections();
};
