/* =========================================================
   BATCATALOG — script.js
   Consume la Batman API (https://api.batmanapi.com/v1)
   Cumple RF-01..RF-10 y RNF-01..RNF-05 del Producto 2.
   ========================================================= */

const API_BASE = 'https://api.batmanapi.com/v1';
const CACHE_KEY = 'batcatalog_cache_v1';
const CACHE_TTL_MS = 60 * 1000; // "menos de 1 minuto" (ver plan de mantenimiento)

/* ---------- Configuración por categoría (RF-01 a RF-04) ---------- */
const CATEGORIES = {
  characters: {
    label: 'Personajes', index: '01', endpoint: 'characters', total: 83,
    titleField: 'name', subtitleField: 'alias',
    sortFields: [
      { value: 'name', label: 'Nombre' },
      { value: 'role', label: 'Rol' },
      { value: 'first_appearance', label: 'Primera aparición' },
    ],
    filter: { key: 'role', label: 'Rol', placeholder: 'Ej. Hero, Villain...' },
    cardMeta(a) {
      const chips = [];
      if (a.role) chips.push({ text: a.role });
      if (typeof a.alive === 'boolean') chips.push({ text: a.alive ? 'Con vida' : 'Sin confirmar', cls: a.alive ? 'alive' : 'dead' });
      return chips;
    },
    detailFields: [
      { key: 'alias', label: 'Alias' },
      { key: 'role', label: 'Rol' },
      { key: 'alive', label: 'Estado', fmt: v => (v ? 'Con vida' : 'Fallecido / sin confirmar') },
      { key: 'gender', label: 'Género' },
      { key: 'creator', label: 'Creador' },
      { key: 'first_appearance', label: 'Primera aparición' },
      { key: 'abilities', label: 'Habilidades', isList: true },
    ],
  },
  locations: {
    label: 'Ubicaciones', index: '02', endpoint: 'locations', total: 49,
    titleField: 'name', subtitleField: 'type',
    sortFields: [
      { value: 'name', label: 'Nombre' },
      { value: 'type', label: 'Tipo' },
    ],
    filter: { key: 'type', label: 'Tipo', placeholder: 'Ej. City, Park...' },
    cardMeta(a) {
      const chips = [];
      if (a.type) chips.push({ text: a.type });
      return chips;
    },
    detailFields: [
      { key: 'type', label: 'Tipo' },
      { key: 'creator', label: 'Creador' },
      { key: 'first_appearance', label: 'Primera aparición' },
      { key: 'coordinates', label: 'Coordenadas', fmt: v => (v ? `${v.latitude}, ${v.longitude}` : '—') },
      { key: 'notable_events', label: 'Eventos notables', isList: true },
      { key: 'related_characters', label: 'Personajes relacionados', isList: true },
    ],
  },
  concepts: {
    label: 'Conceptos', index: '03', endpoint: 'concepts', total: 38,
    titleField: 'name', subtitleField: 'type',
    sortFields: [
      { value: 'name', label: 'Nombre' },
      { value: 'type', label: 'Tipo' },
    ],
    filter: { key: 'type', label: 'Tipo', placeholder: 'Ej. Device, Vehicle...' },
    cardMeta(a) {
      const chips = [];
      if (a.type) chips.push({ text: a.type });
      return chips;
    },
    detailFields: [
      { key: 'type', label: 'Tipo' },
      { key: 'creator', label: 'Creador' },
      { key: 'first_appearance', label: 'Primera aparición' },
      { key: 'related_characters', label: 'Personajes relacionados', isList: true },
      { key: 'related_locations', label: 'Ubicaciones relacionadas', isList: true },
    ],
  },
  storylines: {
    label: 'Historias', index: '04', endpoint: 'storylines', total: 41,
    titleField: 'name', subtitleField: 'writer',
    sortFields: [
      { value: 'name', label: 'Nombre' },
      { value: 'publication_date', label: 'Fecha de publicación' },
    ],
    filter: { key: 'writer', label: 'Escritor', placeholder: 'Ej. Jeph Loeb...' },
    cardMeta(a) {
      const chips = [];
      if (a.publication_date) chips.push({ text: a.publication_date });
      return chips;
    },
    detailFields: [
      { key: 'writer', label: 'Escritor' },
      { key: 'artist', label: 'Artista' },
      { key: 'publication_date', label: 'Publicación' },
      { key: 'issues', label: 'Números / issues', isList: true },
      { key: 'characters', label: 'Personajes', isList: true },
      { key: 'locations', label: 'Ubicaciones', isList: true },
    ],
  },
};

/* ---------- Estado de la aplicación ---------- */
const state = {
  category: 'characters',
  page: 1,
  pageSize: 8,
  search: '',
  filterValue: '',
  sortField: 'name',
  sortDir: 'asc',
  lastMeta: null,
};

let searchDebounce = null;

/* ---------- Referencias al DOM ---------- */
const el = {
  tabs: document.getElementById('tabs'),
  search: document.getElementById('search-input'),
  sortField: document.getElementById('sort-field'),
  sortDir: document.getElementById('sort-dir'),
  filterField: document.getElementById('filter-field'),
  filterLabel: document.getElementById('filter-label'),
  pageSize: document.getElementById('page-size'),
  resultsCount: document.getElementById('results-count'),
  grid: document.getElementById('grid'),
  pagination: document.getElementById('pagination'),
  overlay: document.getElementById('overlay'),
  dossier: document.getElementById('dossier'),
  dossierContent: document.getElementById('dossier-content'),
  dossierClose: document.getElementById('dossier-close'),
};

/* =========================================================
   CACHÉ (RNF-05): memoria + localStorage, TTL de 60s
   ========================================================= */
function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; }
  catch { return {}; }
}
function writeCache(store) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(store)); }
  catch { /* localStorage no disponible: se sigue funcionando sin caché persistente */ }
}
function getCached(key) {
  const store = readCache();
  const hit = store[key];
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;
  return null;
}
function setCached(key, data) {
  const store = readCache();
  store[key] = { ts: Date.now(), data };
  writeCache(store);
}

/* =========================================================
   Llamadas a la API (RF-01..RF-08)
   ========================================================= */
function buildListUrl(cat) {
  const cfg = CATEGORIES[cat];
  const params = new URLSearchParams();
  params.set('pagination[page]', state.page);
  params.set('pagination[pageSize]', state.pageSize);
  params.set('sort', `${state.sortField}:${state.sortDir}`);
  if (state.search.trim()) {
    params.set(`filters[${cfg.titleField}][$containsi]`, state.search.trim());
  }
  if (state.filterValue.trim()) {
    params.set(`filters[${cfg.filter.key}][$containsi]`, state.filterValue.trim());
  }
  return `${API_BASE}/${cfg.endpoint}?${params.toString()}`;
}

async function fetchList(cat) {
  const url = buildListUrl(cat);
  const cacheKey = `list:${url}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`La API respondió con estado ${res.status}`);
  const json = await res.json();
  setCached(cacheKey, json);
  return json;
}

async function fetchDetail(cat, id) {
  const cfg = CATEGORIES[cat];
  const url = `${API_BASE}/${cfg.endpoint}/${id}`;
  const cacheKey = `detail:${url}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`La API respondió con estado ${res.status}`);
  const json = await res.json();
  setCached(cacheKey, json);
  return json;
}

/* =========================================================
   Render: pestañas de categoría (RF-05)
   ========================================================= */
function renderTabs() {
  el.tabs.innerHTML = '';
  Object.entries(CATEGORIES).forEach(([key, cfg]) => {
    const btn = document.createElement('button');
    btn.className = 'tab';
    btn.type = 'button';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(key === state.category));
    btn.innerHTML = `<span class="tab-index">${cfg.index}</span>${cfg.label}`;
    btn.addEventListener('click', () => {
      if (state.category === key) return;
      state.category = key;
      state.page = 1;
      state.search = '';
      state.filterValue = '';
      el.search.value = '';
      el.filterField.value = '';
      state.sortField = cfg.sortFields[0].value;
      renderTabs();
      renderControls();
      loadAndRenderList();
    });
    el.tabs.appendChild(btn);
  });
}

/* ---------- Controles: orden, filtro secundario, tamaño de página ---------- */
function renderControls() {
  const cfg = CATEGORIES[state.category];

  el.sortField.innerHTML = cfg.sortFields
    .map(f => `<option value="${f.value}">${f.label}</option>`)
    .join('');
  el.sortField.value = state.sortField;

  el.filterLabel.textContent = cfg.filter.label;
  el.filterField.placeholder = cfg.filter.placeholder;
  el.filterField.value = state.filterValue;
}

/* =========================================================
   Render: grilla de tarjetas (dossier cards)
   ========================================================= */
/* Íconos de respaldo GENÉRICOS por categoría (silueta, skyline, gadget, libro).
   Deliberadamente abstractos: no representan a ningún personaje con derechos
   de autor. Se usan solo cuando la API no entrega una imagen real
   (ver nota sobre image_url -> example.com en la documentación de la API). */
const FALLBACK_ICONS = {
  characters: `
    <svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="19" r="12" fill="#ECE8DD"/>
      <path fill="#ECE8DD" d="M28 56c0-15.5 9.8-24 22-24s22 8.5 22 24z"/>
    </svg>`,
  locations: `
    <svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="32" width="14" height="24" fill="#ECE8DD"/>
      <rect x="28" y="20" width="14" height="36" fill="#ECE8DD"/>
      <rect x="46" y="8" width="14" height="48" fill="#ECE8DD"/>
      <rect x="64" y="26" width="14" height="30" fill="#ECE8DD"/>
      <rect x="49" y="2" width="2" height="8" fill="#ECE8DD"/>
      <rect x="30" y="26" width="3" height="4" fill="#15181E"/>
      <rect x="36" y="26" width="3" height="4" fill="#15181E"/>
      <rect x="30" y="34" width="3" height="4" fill="#15181E"/>
      <rect x="36" y="34" width="3" height="4" fill="#15181E"/>
    </svg>`,
  concepts: `
    <svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="30" r="13" fill="none" stroke="#ECE8DD" stroke-width="4"/>
      <line x1="50" y1="4" x2="50" y2="13" stroke="#ECE8DD" stroke-width="4"/>
      <line x1="50" y1="47" x2="50" y2="56" stroke="#ECE8DD" stroke-width="4"/>
      <line x1="24" y1="30" x2="33" y2="30" stroke="#ECE8DD" stroke-width="4"/>
      <line x1="67" y1="30" x2="76" y2="30" stroke="#ECE8DD" stroke-width="4"/>
      <line x1="32" y1="12" x2="38" y2="18" stroke="#ECE8DD" stroke-width="4"/>
      <line x1="62" y1="42" x2="68" y2="48" stroke="#ECE8DD" stroke-width="4"/>
      <line x1="68" y1="12" x2="62" y2="18" stroke="#ECE8DD" stroke-width="4"/>
      <line x1="38" y1="42" x2="32" y2="48" stroke="#ECE8DD" stroke-width="4"/>
    </svg>`,
  storylines: `
    <svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
      <path fill="#ECE8DD" d="M50 13 L50 51 L13 46 L13 16 Z"/>
      <path fill="#ECE8DD" d="M50 13 L50 51 L87 46 L87 16 Z"/>
      <line x1="50" y1="13" x2="50" y2="51" stroke="#15181E" stroke-width="2"/>
    </svg>`,
};

function fallbackIcon(cat) {
  return FALLBACK_ICONS[cat] || FALLBACK_ICONS.characters;
}

/* La API devuelve, para varios campos vacíos, el texto literal "None"
   en vez de omitir el campo. Lo tratamos como vacío para no mostrarlo. */
function isEmpty(v) {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return true;
    if (/^(none|n\/a|null|undefined)$/i.test(t)) return true;
  }
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

/* Si la imagen de la API falla (ej. apunta a example.com), se sustituye
   por el ícono temático de la categoría en vez de dejar la caja vacía. */
function handleImgError(imgEl, category) {
  const thumb = imgEl.closest('.card-thumb');
  if (!thumb) return;
  thumb.classList.add('is-fallback');
  imgEl.remove();
  thumb.insertAdjacentHTML('beforeend', fallbackIcon(category));
}

function handleDossierImgError(imgEl, category) {
  const photo = imgEl.closest('.dossier-photo');
  if (!photo) return;
  photo.classList.add('is-fallback');
  imgEl.remove();
  photo.insertAdjacentHTML('beforeend', fallbackIcon(category));
}

function fmtId(cat, id) {
  return `${CATEGORIES[cat].index}-${String(id).padStart(3, '0')}`;
}

function renderSkeleton(count = 8) {
  el.grid.innerHTML = Array.from({ length: count }).map(() => `
    <div class="skeleton">
      <div class="sk-block sk-thumb"></div>
      <div class="sk-block sk-line"></div>
      <div class="sk-block sk-line short"></div>
    </div>
  `).join('');
}

function renderCards(items) {
  const cfg = CATEGORIES[state.category];

  if (!items.length) {
    el.grid.innerHTML = `
      <div class="state-panel">
        <div class="state-stamp">Sin coincidencias</div>
        <p>No se encontraron expedientes con esos criterios de búsqueda.</p>
      </div>`;
    return;
  }

  el.grid.innerHTML = items.map(item => {
    const a = item.attributes || {};
    const title = isEmpty(a[cfg.titleField]) ? 'Sin nombre' : a[cfg.titleField];
    const subtitle = isEmpty(a[cfg.subtitleField]) ? '' : a[cfg.subtitleField];
    const desc = isEmpty(a.description) ? '' : a.description;
    const chips = (cfg.cardMeta(a) || []).filter(c => !isEmpty(c.text));
    const img = isEmpty(a.image_url) ? '' : a.image_url;

    return `
      <button class="card" type="button" data-id="${item.id}" aria-label="Abrir expediente: ${title}">
        <span class="card-thumb ${img ? '' : 'is-fallback'}" data-fallback data-category="${state.category}">
          <span class="card-id">${fmtId(state.category, item.id)}</span>
          ${img
            ? `<img src="${img}" alt="${title}" loading="lazy" onerror="handleImgError(this, '${state.category}')">`
            : fallbackIcon(state.category)}
        </span>
        <h3 class="card-title">${title}</h3>
        ${subtitle ? `<p class="card-subtitle">${subtitle}</p>` : ''}
        ${desc ? `<p class="card-desc">${desc}</p>` : ''}
        <span class="card-meta">
          ${chips.map(c => `<span class="chip ${c.cls || ''}">${c.text}</span>`).join('')}
        </span>
        <span class="card-stamp">Abrir expediente</span>
      </button>
    `;
  }).join('');

  el.grid.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => openDossier(state.category, card.dataset.id));
  });
}

function renderError(message, onRetry) {
  el.grid.innerHTML = `
    <div class="state-panel is-error">
      <div class="state-stamp">Error de conexión</div>
      <p>${message}</p>
      <button type="button">Reintentar</button>
    </div>`;
  el.grid.querySelector('button').addEventListener('click', onRetry);
}

/* ---------- Paginación (RF-07) ---------- */
function renderPagination(meta) {
  const pag = meta && meta.pagination;
  if (!pag || pag.pageCount <= 1) { el.pagination.innerHTML = ''; return; }

  const { page, pageCount } = pag;
  const pages = [];
  const spread = 1;
  for (let p = 1; p <= pageCount; p++) {
    if (p === 1 || p === pageCount || Math.abs(p - page) <= spread) pages.push(p);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  }

  el.pagination.innerHTML = `
    <button type="button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>«</button>
    ${pages.map(p => p === '…'
      ? `<span aria-hidden="true">…</span>`
      : `<button type="button" data-page="${p}" class="${p === page ? 'active' : ''}">${p}</button>`
    ).join('')}
    <button type="button" data-page="${page + 1}" ${page >= pageCount ? 'disabled' : ''}>»</button>
  `;

  el.pagination.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.page = Number(btn.dataset.page);
      loadAndRenderList();
    });
  });
}

/* =========================================================
   Carga principal de la lista (orquesta todo lo anterior)
   ========================================================= */
async function loadAndRenderList() {
  renderSkeleton(state.pageSize);
  el.resultsCount.textContent = 'Cargando…';
  el.pagination.innerHTML = '';

  try {
    const json = await fetchList(state.category);
    const items = json.data || [];
    state.lastMeta = json.meta;
    renderCards(items);
    renderPagination(json.meta);

    const pag = json.meta && json.meta.pagination;
    if (pag) {
      const from = (pag.page - 1) * pag.pageSize + 1;
      const to = Math.min(pag.page * pag.pageSize, pag.total);
      el.resultsCount.textContent = pag.total
        ? `Mostrando ${from}–${to} de ${pag.total}`
        : 'Sin resultados';
    } else {
      el.resultsCount.textContent = `${items.length} resultado(s)`;
    }
  } catch (err) {
    console.error(err);
    el.resultsCount.textContent = '';
    renderError(
      'No se pudo consultar el archivo de la GCPD (Batman API). Verifica tu conexión e intenta de nuevo.',
      loadAndRenderList
    );
  }
}

/* =========================================================
   Dossier de detalle (RF-06)
   ========================================================= */
async function openDossier(cat, id) {
  el.overlay.classList.add('open');
  el.dossier.classList.add('open');
  el.dossierContent.innerHTML = `
    <div class="dossier-loading">
      <div class="scanline"></div>
      Cargando…
    </div>`;

  try {
    const json = await fetchDetail(cat, id);
    renderDossier(cat, json.data);
  } catch (err) {
    console.error(err);
    el.dossierContent.innerHTML = `
      <div class="dossier-error">
        <div class="state-stamp" style="border-color:var(--blood);color:var(--blood);">Expediente no disponible</div>
        <p>No se pudo cargar el detalle. Intenta de nuevo.</p>
        <button type="button" id="dossier-retry">Reintentar</button>
      </div>`;
    document.getElementById('dossier-retry').addEventListener('click', () => openDossier(cat, id));
  }
}

function renderDossier(cat, item) {
  const cfg = CATEGORIES[cat];
  const a = item.attributes || {};
  const title = isEmpty(a[cfg.titleField]) ? 'Sin nombre' : a[cfg.titleField];
  const subtitle = isEmpty(a[cfg.subtitleField]) ? '' : a[cfg.subtitleField];
  const description = isEmpty(a.description) ? '' : a.description;
  const img = isEmpty(a.image_url) ? '' : a.image_url;

  const rows = cfg.detailFields.map(f => {
    let value = a[f.key];
    if (isEmpty(value)) return '';
    let html;
    if (f.isList && Array.isArray(value)) {
      const clean = value.filter(v => !isEmpty(v));
      if (!clean.length) return '';
      html = `<div class="tag-list">${clean.map(v => `<span class="tag">${v}</span>`).join('')}</div>`;
    } else if (f.fmt) {
      html = f.fmt(value);
    } else {
      html = value;
    }
    return `
      <div class="kv-row">
        <dt>${f.label}</dt>
        <dd>${html}</dd>
      </div>`;
  }).join('');

  el.dossierContent.innerHTML = `
    <div class="dossier-stamp">Expediente GCPD · ${fmtId(cat, item.id)}</div>
    <div class="dossier-photo ${img ? '' : 'is-fallback'}">
      ${img
        ? `<img src="${img}" alt="${title}" onerror="handleDossierImgError(this, '${cat}')">`
        : fallbackIcon(cat)}
    </div>
    <h2>${title}</h2>
    ${subtitle ? `<p class="dossier-subtitle">${subtitle}</p>` : ''}
    ${description ? `<p class="dossier-desc">${description}</p>` : ''}
    <dl>${rows}</dl>
  `;
}

function closeDossier() {
  el.overlay.classList.remove('open');
  el.dossier.classList.remove('open');
}

/* =========================================================
   Eventos de controles
   ========================================================= */
el.search.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    state.search = el.search.value;
    state.page = 1;
    loadAndRenderList();
  }, 400);
});

el.filterField.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    state.filterValue = el.filterField.value;
    state.page = 1;
    loadAndRenderList();
  }, 400);
});

el.sortField.addEventListener('change', () => {
  state.sortField = el.sortField.value;
  loadAndRenderList();
});

el.sortDir.addEventListener('click', () => {
  state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  el.sortDir.dataset.dir = state.sortDir;
  loadAndRenderList();
});

el.pageSize.addEventListener('change', () => {
  state.pageSize = Number(el.pageSize.value);
  state.page = 1;
  loadAndRenderList();
});

el.overlay.addEventListener('click', closeDossier);
el.dossierClose.addEventListener('click', closeDossier);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeDossier();
});

/* =========================================================
   Arranque
   ========================================================= */
renderTabs();
renderControls();
loadAndRenderList();
