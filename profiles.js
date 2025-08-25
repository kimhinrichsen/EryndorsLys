// profiles.js – multi-karakter system, avatar kun gemt på profilniveau.
// VIGTIGT: Avatarer genereres som korrekt URL-encodede data-URLs (forhindrer
// de 'knækkede' billeder du så i preset-grid).

const PROFILE_STORE_KEY = 'eryndors_profiles_v1';

/* Rå SVG'er (ubehandlede) */
const RAW_PRESET_AVATARS = [
  {
    id:'owl',
    label:'Ugle',
    svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <circle cx="48" cy="48" r="46" fill="#2c2f35"/>
      <circle cx="34" cy="40" r="14" fill="#ffffff"/>
      <circle cx="62" cy="40" r="14" fill="#ffffff"/>
      <circle cx="34" cy="40" r="8" fill="#000000"/>
      <circle cx="62" cy="40" r="8" fill="#000000"/>
      <path d="M28 70c10 6 30 6 40 0-3 10-13 18-20 18s-17-8-20-18z" fill="#ffb347"/>
    </svg>`
  },
  {
    id:'quill',
    label:'Fjerpen',
    svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <rect width="96" height="96" rx="18" fill="#2a2e33"/>
      <path d="M62 12 22 52l-4 20 20-4 40-40-16-16zm-6 10 10 10L38 60l-10-10L56 22z" fill="#e8e2d0"/>
    </svg>`
  },
  {
    id:'helm',
    label:'Hjelm',
    svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <rect width="96" height="96" rx="20" fill="#33302a"/>
      <path d="M48 14c-18 0-30 12-30 44v12c0 4 2 6 6 6h12v-22l12-6 12 6v22h12c4 0 6-2 6-6V58C78 26 66 14 48 14z" fill="#cdb28a"/>
      <path d="M36 54v22h6V52l-6 2zm24 0-6-2v24h6V54z" fill="#7c6442"/>
    </svg>`
  },
  {
    id:'leaf',
    label:'Blad',
    svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <rect width="96" height="96" rx="22" fill="#1f3324"/>
      <path d="M70 20c-8 14-20 20-32 28-8 6-12 15-12 28 18 0 30-8 38-18 10-14 12-26 6-38z" fill="#72c28a"/>
      <path d="M54 24c-10 16-26 22-30 46" stroke="#4a7c55" stroke-width="6" fill="none" stroke-linecap="round"/>
    </svg>`
  },
  {
    id:'mask',
    label:'Maske',
    svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <rect width="96" height="96" rx="18" fill="#2b2333"/>
      <path d="M22 34c0-10 10-18 26-18s26 8 26 18-8 22-26 22S22 44 22 34z" fill="#d4c6ff"/>
      <path d="M38 40c-4 0-6-2-6-4s2-4 6-4 6 2 6 4-2 4-6 4zm20 0c-4 0-6-2-6-4s2-4 6-4 6 2 6 4-2 4-6 4z" fill="#000"/>
    </svg>`
  },
  {
    id:'runestone',
    label:'Runesten',
    svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
      <rect width="96" height="96" rx="16" fill="#212a30"/>
      <path d="M28 78 18 58l10-40 24-8 20 14 6 30-14 24-20 4z" fill="#4f5d67"/>
      <path d="M48 24 38 52h16l-8 18" stroke="#ffce54" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>`
  }
];

/* Konverter rå svg til sikre data-urls */
export const PRESET_AVATARS = RAW_PRESET_AVATARS.map(r => ({
  id: r.id,
  label: r.label,
  src: 'data:image/svg+xml;utf8,' + encodeURIComponent(r.svg.replace(/\s{2,}/g,' '))
}));

function _uuid(){
  return 'p_' + Math.random().toString(36).slice(2,10);
}

function loadProfiles(){
  try {
    const raw = localStorage.getItem(PROFILE_STORE_KEY);
    if(!raw) return { activeProfileId:null, profiles:{} };
    const data = JSON.parse(raw);
    if(!data || typeof data !== 'object') return { activeProfileId:null, profiles:{} };
    if(!data.profiles) data.profiles = {};
    return data;
  } catch(e){
    console.warn('loadProfiles fejl', e);
    return { activeProfileId:null, profiles:{} };
  }
}

function saveProfiles(store){
  try {
    localStorage.setItem(PROFILE_STORE_KEY, JSON.stringify(store));
  } catch(e){
    console.warn('saveProfiles fejl', e);
  }
}

export function ensureProfileStore(){
  const store = loadProfiles();
  saveProfiles(store);
  return store;
}

export function listProfiles(){
  const store = ensureProfileStore();
  return Object.entries(store.profiles).map(([id, obj])=>({
    id,
    name: obj.name || 'Ukendt',
    createdAt: obj.createdAt,
    xp: obj.state?.xp || 0,
    avatar: obj.avatar || null
  }));
}

export function getActiveProfile(){
  const store = ensureProfileStore();
  if(!store.activeProfileId) return null;
  return store.profiles[store.activeProfileId] || null;
}

export function getActiveProfileState(){
  return getActiveProfile()?.state || null;
}

export function setActiveProfile(profileId){
  const store = ensureProfileStore();
  if(store.profiles[profileId]){
    store.activeProfileId = profileId;
    saveProfiles(store);
    return true;
  }
  return false;
}

export function createProfile(name, avatar, initialStateFactory){
  const store = ensureProfileStore();
  const id = _uuid();
  const st = initialStateFactory();
  if(st.meta){
    st.meta.avatar = null; // avatar kun på profil
  }
  store.profiles[id] = {
    id,
    name: name || 'Karakter',
    avatar: avatar || null,
    createdAt: Date.now(),
    state: st
  };
  store.activeProfileId = id;
  saveProfiles(store);
  return id;
}

export function overwriteActiveProfileState(newState){
  const store = ensureProfileStore();
  if(!store.activeProfileId) return;
  const p = store.profiles[store.activeProfileId];
  if(!p) return;
  if(newState.meta){
    newState.meta.avatar = null;
  }
  p.state = newState;
  saveProfiles(store);
}

export function resetActiveProfile(initialStateFactory){
  const store = ensureProfileStore();
  if(!store.activeProfileId) return false;
  const id = store.activeProfileId;
  if(!store.profiles[id]) return false;
  const st = initialStateFactory();
  if(st.meta) st.meta.avatar = null;
  store.profiles[id].state = st;
  saveProfiles(store);
  return true;
}

export function deleteProfile(profileId){
  const store = ensureProfileStore();
  if(store.profiles[profileId]){
    delete store.profiles[profileId];
    if(store.activeProfileId === profileId){
      store.activeProfileId = Object.keys(store.profiles)[0] || null;
    }
    saveProfiles(store);
  }
}

export function updateActiveProfileMeta({ name, avatar }){
  const store = ensureProfileStore();
  const id = store.activeProfileId;
  if(!id) return;
  const p = store.profiles[id];
  if(!p) return;
  if(name) p.name = name;
  if(avatar !== undefined) p.avatar = avatar;
  saveProfiles(store);
}

export function exportProfilesJSON(){
  return JSON.stringify(ensureProfileStore(), null, 2);
}

export function debugProfileStorageSize(){
  const raw = localStorage.getItem(PROFILE_STORE_KEY);
  return raw ? raw.length : 0;
}
