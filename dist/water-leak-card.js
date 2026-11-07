/**
 * Water Leak Card — Home Assistant dashboard card.
 * Copyright (c) 2026 luigi-regolo. SPDX-License-Identifier: GPL-3.0-only.
 * No telemetry, remote scripts, external assets, or credentials. Read-only: never sends commands.
 */
const WL_TAG = 'water-leak-card';
const WL_TYPE = 'custom:water-leak-card';
const WL_EDITOR_TAG = 'water-leak-card-editor';
const WL_HISTORY_DAYS = 30;
const WL_DEFAULTS = Object.freeze({
  title: "Perdite d'acqua", eyebrow: 'WATER LEAK CARD', theme_mode: 'auto',
  show_eyebrow: true, show_title: true, show_last_update: true, show_details: true, show_history: true
});
function wlText(value, limit = 90) { return String(value ?? '').trim().slice(0, limit); }
function wlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
}
function wlEntityId(value) {
  const id = wlText(value, 160);
  return /^binary_sensor\.[a-z0-9_]+$/.test(id) ? id : '';
}
// Accepts both "binary_sensor.x" strings and {entity, name} objects; drops invalid and duplicate entries.
function wlEntities(raw) {
  const out = [], seen = new Set();
  for (const item of Array.isArray(raw) ? raw : []) {
    const isObject = item && typeof item === 'object' && !Array.isArray(item);
    const id = wlEntityId(isObject ? item.entity : item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({entity: id, name: wlText(isObject ? item.name : '', 60)});
  }
  return out;
}
function wlConfig(raw = {}) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    // Keep Lovelace visibility and layout options during editor changes.
    ...r,
    type: WL_TYPE,
    title: wlText(r.title ?? WL_DEFAULTS.title, 60).replace(/\.+$/, '') || WL_DEFAULTS.title,
    eyebrow: wlText(r.eyebrow ?? WL_DEFAULTS.eyebrow, 60),
    theme_mode: ['auto', 'light', 'dark'].includes(r.theme_mode) ? r.theme_mode : 'auto',
    entities: wlEntities(r.entities),
    show_eyebrow: r.show_eyebrow !== false,
    show_title: r.show_title !== false,
    show_last_update: r.show_last_update !== false,
    show_details: r.show_details !== false,
    show_history: r.show_history !== false
  };
}
function wlIcon(name) { return `<ha-icon icon="mdi:${name}" aria-hidden="true"></ha-icon>`; }
// Only "on" is a leak and only "off" is dry: unavailable, unknown or a missing entity is never treated as safe.
function wlStatus(entity) {
  if (!entity) return 'na';
  if (entity.state === 'on') return 'wet';
  if (entity.state === 'off') return 'dry';
  return 'na';
}
const WL_LABEL = Object.freeze({dry: 'Asciutto', wet: 'Perdita rilevata', na: 'Non disponibile'});
const WL_SHORT = Object.freeze({dry: 'Asciutto', wet: 'Perdita', na: 'Non disponibile'});
const WL_CLASS = Object.freeze({dry: 'wl-ok', wet: 'wl-wet', na: 'wl-na'});
const WL_ICON = Object.freeze({dry: 'water', wet: 'alert', na: 'cancel'});
function wlDayNumber(date, zone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'})
    .formatToParts(date).map(x => [x.type, x.value]));
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)) / 86400000;
}
function wlWhen(value, now, zone) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return '—';
  const time = new Intl.DateTimeFormat('it-IT', {hour: '2-digit', minute: '2-digit', timeZone: zone}).format(date);
  const diff = wlDayNumber(now, zone) - wlDayNumber(date, zone);
  if (diff === 0) return `oggi ${time}`;
  if (diff === 1) return `ieri ${time}`;
  if (diff >= 2 && diff <= 6) return `${new Intl.DateTimeFormat('it-IT', {weekday: 'short', timeZone: zone}).format(date)} ${time}`;
  return `${new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'short', timeZone: zone}).format(date)} ${time}`;
}
function wlDuration(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 1) return 'meno di 1 min';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 6) { const r = m % 60; return r ? `${h} h ${r} min` : `${h} h`; }
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} giorni`;
}
function wlStamp(point) {
  const v = point?.lu ?? point?.last_updated;
  if (typeof v === 'number' && Number.isFinite(v)) return v * 1000;
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isFinite(t) ? t : null; }
  return null;
}
// Leak events: from a state "on" until the next state that is not "on".
function wlEvents(history, ids) {
  const events = [];
  for (const id of ids) {
    const points = Array.isArray(history?.[id]) ? history[id] : [];
    let start = null;
    for (const point of points) {
      const state = point?.s ?? point?.state, t = wlStamp(point);
      if (t === null) continue;
      if (state === 'on') { if (start === null) start = t; }
      else if (start !== null) { events.push({entity: id, start, end: t}); start = null; }
    }
    if (start !== null) events.push({entity: id, start, end: null});
  }
  return events.sort((a, b) => b.start - a.start);
}
const WL_CSS = `
:host{display:block;box-sizing:border-box;width:100%;max-width:100%;min-width:0;font-family:var(--ha-font-family-body,Roboto,Arial,sans-serif);color:var(--wl-fg);font-size:var(--ha-font-size-m,14px)}
*,*:before,*:after{box-sizing:border-box}
button{font:inherit}
  .wl-container{display:block;width:100%;max-width:100%;min-width:0;container-type:inline-size}
  .wl-shell,.wl-backdrop{--wl-btn-fg:var(--wl-accent);--wl-accent:#0a7156;--wl-bg:#fafbf9;--wl-tile:#f0f2ef;--wl-circle:#fff;--wl-line:#e0e5df;--wl-fg:#18221c;--wl-muted:#56675c;
    --st-ok:var(--wl-accent);--st-alert:#B85D55;--st-warn:#C89643;--st-na:#858E89}
  .wl-shell.wl-dark,.wl-backdrop.wl-dark{--wl-btn-fg:var(--wl-fg);--wl-accent:#0e795d;--wl-bg:#101211;--wl-tile:#191c1a;--wl-circle:#282b29;--wl-line:#2b302c;--wl-fg:#f5f7f4;--wl-muted:#bbc5bd;
    --st-ok:#2fa585;--st-alert:#D27369;--st-warn:#D8B05D;--st-na:#8B918E}
  .wl-shell{background:var(--wl-bg);color:var(--wl-fg);border:1px solid var(--wl-line);border-radius:26px;padding:18px;width:100%;min-width:0}
  .wl-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin:2px 4px 17px}
  .wl-eyebrow{font-size:10px;letter-spacing:1.7px;font-weight:750;color:var(--wl-muted);margin-bottom:7px}
  .wl-title{font-size:25px;line-height:1.14;font-weight:780;letter-spacing:-.7px;overflow-wrap:anywhere}
  .wl-title b{color:var(--wl-accent);font-weight:800}
  .wl-panel{background:var(--wl-tile);border:1px solid var(--wl-line);border-radius:24px;padding:13px;min-width:0}
  .wl-current{display:flex;align-items:center;gap:12px}
  .wl-orb{display:grid;place-items:center;flex:none;width:52px;height:52px;border-radius:50%;background:var(--wl-circle);color:var(--c)}
  .wl-main{min-width:0;flex:1}
  .wl-big{font-size:23px;font-weight:650;line-height:1.15;letter-spacing:-.5px;color:var(--c)}
  .wl-sub{font-size:11.5px;line-height:1.4;color:var(--wl-muted);margin-top:3px;overflow-wrap:anywhere}
  .wl-heading{color:var(--wl-muted);font-size:10px;font-weight:600;letter-spacing:1.3px;margin:17px 4px 10px}
  .wl-hero{display:flex;align-items:center;gap:14px;border-radius:22px;padding:14px;margin-bottom:10px;border:1px solid color-mix(in srgb,var(--c) 40%,transparent);background:color-mix(in srgb,var(--c) 9%,transparent)}
  .wl-ring{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;flex:none;border:3px solid var(--c);color:var(--c);background:color-mix(in srgb,var(--c) 14%,transparent)}
  .wl-hero-t{font-size:16px;font-weight:600;line-height:1.2}
  .wl-hero .wl-sub{margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .wl-hero>div:last-child{min-width:0;flex:1}
  .wl-rows{display:grid;grid-template-columns:1fr;gap:8px}
  .wl-row{position:relative;overflow:hidden;display:flex;gap:11px;align-items:center;min-width:0;background:var(--wl-tile);border:0;padding:10px 12px 10px 16px;border-radius:16px;min-height:56px}
  .wl-row:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--c)}
  .wl-row-orb{display:grid;place-items:center;flex:none;width:35px;height:35px;background:var(--wl-tile);border-radius:50%;color:var(--c)}
  .wl-row .wl-row-orb{width:36px;height:36px;background:color-mix(in srgb,var(--c) 18%,transparent)}
  .wl-row-t{min-width:0;flex:1}
  .wl-row-nm{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .wl-row-st{font-size:11.5px;font-weight:600;color:var(--c);margin-top:1px}
  .wl-row-r{text-align:right;font-size:10.5px;color:var(--wl-muted);line-height:1.35;white-space:nowrap}
  .wl-row-r strong{display:block;font-size:12px;font-weight:600;color:var(--wl-fg)}
  .wl-ok{--c:var(--st-ok)} .wl-wet{--c:var(--st-alert)} .wl-na{--c:var(--st-na)} .wl-warn{--c:var(--st-warn)}
  .wl-row.wl-wet{background:color-mix(in srgb,var(--st-alert) 12%,var(--wl-tile))}
  .wl-row-r .lbl{display:block}
  .wl-foot{margin-top:14px}
  .wl-detail{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:44px;padding:10px 14px;border-radius:999px;font-family:inherit;font-weight:600;font-size:13.5px;line-height:1.2;color:var(--wl-btn-fg);border:1px solid color-mix(in srgb,var(--wl-accent) 45%,transparent);background:color-mix(in srgb,var(--wl-accent) 12%,transparent)}
  .wl-detail:hover{background:color-mix(in srgb,var(--wl-accent) 22%,transparent)}
  .wl-detail svg{flex:none}
  button:focus-visible{outline:2px solid var(--wl-accent,var(--primary-color));outline-offset:3px}
  @container (min-width:600px){
    .wl-shell{padding:22px;border-radius:28px}.wl-title{font-size:28px}.wl-eyebrow{font-size:10.5px}
    .wl-ring{width:62px;height:62px}.wl-hero{padding:18px;gap:18px}.wl-hero-t{font-size:18px}.wl-hero .wl-sub{font-size:12.5px}
    .wl-rows{grid-template-columns:1fr 1fr;gap:10px}.wl-rows.n1{grid-template-columns:1fr}
    .wl-row{padding:12px 14px 12px 18px}.wl-row-nm{font-size:14px}.wl-row-st{font-size:12px}
  }
  @container (min-width:900px){
    .wl-rows.n3,.wl-rows.n5{grid-template-columns:repeat(3,1fr)}
  }
  @container (max-width:380px){.wl-shell{padding:13px;border-radius:23px}.wl-title{font-size:23px}.wl-ring{width:46px;height:46px}.wl-hero{padding:12px;gap:11px}.wl-row-r .lbl{font-size:0;line-height:0}.wl-row-r .lbl:after{content:"Aggiornato";font-size:10.5px;line-height:1.35}}
  @container (max-width:310px){.wl-shell{padding:10px}.wl-title{font-size:21px}.wl-eyebrow{font-size:9px}.wl-ring{width:40px;height:40px;border-width:2px}.wl-hero{padding:10px}.wl-row-r{display:none}}

  /* popup */
  .wl-backdrop{position:fixed;inset:0;z-index:9999;background:#0009;display:flex;align-items:center;justify-content:center;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}
  .wl-dialog{width:min(390px,100%);min-width:0;max-height:min(88dvh,680px);display:flex;flex-direction:column;background:var(--wl-bg);color:var(--wl-fg);border:1px solid var(--wl-line);border-radius:26px;overflow:hidden;box-shadow:0 18px 60px #0005}
  .wl-mhead{flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 16px 12px 18px;background:var(--wl-bg);border-bottom:1px solid var(--wl-line)}
  .wl-mtitle{flex:1;min-width:0;margin:0;font-size:17px;font-weight:600;line-height:1.3;overflow-wrap:anywhere}
  .wl-mtitle b{color:var(--wl-accent)}
  .wl-close{display:grid;place-items:center;padding:0;width:40px;height:40px;flex:none;border:1px solid var(--wl-line);border-radius:50%;background:var(--wl-tile);color:var(--wl-fg)}
  .wl-mbody{overflow-y:auto;overflow-x:hidden;padding:12px 18px 18px;overscroll-behavior:contain}
  .wl-detail-heading{font-weight:600;font-size:13px;margin:17px 0 10px}
  .wl-mbody>.wl-detail-heading:first-child{margin-top:4px}
  .wl-detailbox{background:var(--wl-tile);border-radius:13px;padding:11px 13px;margin-top:7px}
  .wl-dhead{display:flex;align-items:center;gap:10px;margin-bottom:6px}
  .wl-dhead strong{font-size:13px;font-weight:600;flex:1;min-width:0;overflow-wrap:anywhere}
  .wl-tag{font-size:10.5px;font-weight:600;border-radius:999px;padding:3px 9px;color:var(--c);background:color-mix(in srgb,var(--c) 16%,transparent);white-space:nowrap}
  .wl-metric{display:flex;justify-content:space-between;align-items:center;gap:12px;background:var(--wl-tile);border:1px solid var(--wl-line);padding:12px 14px;border-radius:14px;margin-top:8px}
  .wl-metric span{color:var(--wl-muted);font-size:12px}
  .wl-metric strong{font-size:13px;font-weight:600}
  .wl-mrow{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:7px 0;border-top:1px solid var(--wl-line)}
  .wl-mrow span{color:var(--wl-muted);font-size:12px}
  .wl-mrow strong{font-size:12px;font-weight:600;text-align:right;overflow-wrap:anywhere}
  .wl-note{margin-top:14px;font-size:11px;line-height:1.45;color:var(--wl-muted)}
  .wl-ev{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:9px 0;border-top:1px solid var(--wl-line)}
  .wl-ev>div{min-width:0}
  .wl-ev strong{display:block;font-size:12.5px;font-weight:600;overflow-wrap:anywhere}
  .wl-ev .d{display:block;font-size:11.5px;color:var(--wl-muted);margin-top:1px}

  ha-icon{display:block;flex:none;margin:0}
  .wl-ring ha-icon{--mdc-icon-size:26px;width:26px;height:26px}
  .wl-row-orb ha-icon{--mdc-icon-size:19px;width:19px;height:19px}
  .wl-dhead .wl-row-orb ha-icon{--mdc-icon-size:18px;width:18px;height:18px}
  .wl-detail ha-icon{--mdc-icon-size:18px;width:18px;height:18px;color:inherit}
  .wl-close ha-icon{--mdc-icon-size:18px;width:18px;height:18px}
  .wl-empty{color:var(--wl-muted);font-size:11.5px;line-height:1.45;padding:2px 4px}
  .wl-detail{cursor:pointer;transition:background .15s}
`;
class WaterLeakCard extends HTMLElement {
  static getStubConfig() { return wlConfig(); }
  static getConfigElement() { return document.createElement(WL_EDITOR_TAG); }
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this._config = wlConfig();
    this._hass = null;
    this._open = false;
    this._timer = null;
    this._lastSignature = '';
    this._hist = {state: 'idle', events: []};
    this._histToken = 0;
    this._media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    this._onAppearance = () => { this._lastSignature = ''; this._paint(); };
    this._pendingFocus = '';
    this._onKey = e => this._key(e);
    this.shadowRoot.addEventListener('click', e => {
      const t = e.target;
      if (!t || !t.closest) return;
      if (t.dataset?.backdrop === '1' || t.closest('[data-close]')) { this._closePopup(); return; }
      if (t.closest('[data-open]')) this._openPopup();
    });
  }
  connectedCallback() {
    this._media?.addEventListener?.('change', this._onAppearance);
    this._timer = window.setInterval(() => this._paint(), 60000);
    this._paint();
  }
  disconnectedCallback() {
    document.removeEventListener('keydown', this._onKey);
    this._media?.removeEventListener?.('change', this._onAppearance);
    if (this._timer !== null) window.clearInterval(this._timer);
    this._timer = null;
    this._histToken++;
  }
  setConfig(raw) {
    this._config = wlConfig(raw);
    this._lastSignature = '';
    this._paint();
  }
  set hass(hass) { this._hass = hass; this._paint(); }
  getCardSize() { return 2 + Math.max(1, this._config.entities.length); }
  _zone() { return this._hass?.config?.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  _isDark() {
    return this._config.theme_mode === 'dark' ||
      (this._config.theme_mode === 'auto' && (typeof this._hass?.themes?.darkMode === 'boolean' ? this._hass.themes.darkMode : !!this._media?.matches));
  }
  _rows(now) {
    const zone = this._zone();
    return this._config.entities.map(item => {
      const entity = this._hass?.states?.[item.entity];
      const status = wlStatus(entity);
      const since = entity?.last_changed ? new Date(entity.last_changed) : null;
      const valid = since && Number.isFinite(since.getTime());
      return {
        entity: item.entity,
        name: item.name || wlText(entity?.attributes?.friendly_name, 60) || item.entity,
        status,
        when: valid ? wlWhen(since, now, zone) : '—',
        age: valid ? wlDuration(now.getTime() - since.getTime()) : ''
      };
    });
  }
  _title() { return this._config.title || WL_DEFAULTS.title; }
  _openPopup() {
    if (this._open) return;
    this._open = true; this._pendingFocus = 'close'; this._lastSignature = '';
    document.addEventListener('keydown', this._onKey);
    this._loadHistory();
    this._paint();
  }
  _closePopup() {
    if (!this._open) return;
    this._open = false; this._pendingFocus = 'open'; this._lastSignature = '';
    this._histToken++;
    document.removeEventListener('keydown', this._onKey);
    this._paint();
  }
  // Leak history comes from the Home Assistant recorder; when it is not available the section is not shown.
  async _loadHistory() {
    const ids = this._config.entities.map(e => e.entity);
    if (!this._config.show_history || !ids.length || typeof this._hass?.callWS !== 'function') {
      this._hist = {state: 'unavailable', events: []};
      return;
    }
    const token = ++this._histToken;
    this._hist = {state: 'loading', events: []};
    const end = new Date(), start = new Date(end.getTime() - WL_HISTORY_DAYS * 86400000);
    try {
      const result = await this._hass.callWS({
        type: 'history/history_during_period',
        start_time: start.toISOString(), end_time: end.toISOString(), entity_ids: ids,
        include_start_time_state: true, significant_changes_only: false, minimal_response: true, no_attributes: true
      });
      if (token !== this._histToken) return;
      this._hist = {state: 'ready', events: wlEvents(result, ids)};
    } catch {
      if (token !== this._histToken) return;
      this._hist = {state: 'error', events: []};
    }
    this._lastSignature = '';
    this._paint();
  }
  _key(event) {
    if (!this._open) return;
    if (event.key === 'Escape') { this._closePopup(); return; }
    const inBody = event.composedPath().some(n => n.classList && n.classList.contains('wl-mbody'));
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key) && !inBody) { event.preventDefault(); return; }
    if (event.key !== 'Tab') return;
    const nodes = [...this.shadowRoot.querySelectorAll('.wl-dialog button')];
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1], active = this.shadowRoot.activeElement;
    if (event.shiftKey && (active === first || !active)) { event.preventDefault(); last.focus({preventScroll: true}); }
    else if (!event.shiftKey && (active === last || !active)) { event.preventDefault(); first.focus({preventScroll: true}); }
  }
  // While the popup is open the dashboard behind must not move.
  _lockScroll() {
    const overlay = this.shadowRoot.querySelector('.wl-backdrop');
    if (!overlay) return;
    const body = overlay.querySelector('.wl-mbody');
    const atEdge = dy => !body || (dy < 0 && body.scrollTop <= 0) || (dy > 0 && body.scrollTop + body.clientHeight >= body.scrollHeight - 1);
    overlay.addEventListener('wheel', e => { if (!body || !body.contains(e.target) || atEdge(e.deltaY)) e.preventDefault(); }, {passive: false});
    let y = 0;
    overlay.addEventListener('touchstart', e => { const t = e.touches[0]; y = t ? t.clientY : 0; }, {passive: true});
    overlay.addEventListener('touchmove', e => {
      const t = e.touches[0], dy = y - (t ? t.clientY : y);
      if (!body || !body.contains(e.target) || atEdge(dy)) e.preventDefault();
    }, {passive: false});
  }
  _history(rows) {
    if (!this._config.show_history || !rows.length) return '';
    const heading = '<div class="wl-detail-heading">Segnalazioni recenti</div>';
    if (this._hist.state === 'loading') return `${heading}<div class="wl-empty">Caricamento…</div>`;
    if (this._hist.state !== 'ready') return '';
    const names = Object.fromEntries(rows.map(r => [r.entity, r.name]));
    const now = new Date(), zone = this._zone();
    const events = this._hist.events.filter(e => names[e.entity]);
    const list = events.map((e, i) => {
      const live = e.end === null;
      const tag = live ? 'in corso' : wlDuration(e.end - e.start);
      return `<div class="wl-ev ${live ? 'wl-wet' : 'wl-na'}" ${i ? '' : 'style="border-top:0"'}><div><strong>${wlEscape(names[e.entity])}</strong>
        <span class="d">${wlEscape(wlWhen(e.start, now, zone))}</span></div><span class="wl-tag">${wlEscape(tag)}</span></div>`;
    }).join('');
    return `${heading}<div class="wl-metric" style="margin-top:0"><span>Perdite negli ultimi ${WL_HISTORY_DAYS} giorni</span><strong>${events.length}</strong></div>
      ${events.length ? `<div class="wl-detailbox" style="margin-top:8px">${list}</div>` : ''}`;
  }
  _popup(rows) {
    const sensors = rows.length ? rows.map(r => `<div class="wl-detailbox ${WL_CLASS[r.status]}">
      <div class="wl-dhead"><span class="wl-row-orb" style="width:32px;height:32px">${wlIcon(WL_ICON[r.status])}</span><strong>${wlEscape(r.name)}</strong><span class="wl-tag">${WL_LABEL[r.status]}</span></div>
      <div class="wl-mrow"><span>Stato</span><strong>${wlEscape(r.age ? `${WL_SHORT[r.status]} da ${r.age}` : WL_SHORT[r.status])}</strong></div>
      <div class="wl-mrow"><span>Ultimo aggiornamento</span><strong>${wlEscape(r.when)}</strong></div>
      <div class="wl-mrow"><span>Entità</span><strong>${wlEscape(r.entity)}</strong></div></div>`).join('')
      : '<div class="wl-empty">Nessun sensore configurato.</div>';
    return `<div class="wl-backdrop ${this._isDark() ? 'wl-dark' : 'wl-light'}" data-backdrop="1"><div class="wl-dialog" role="dialog" aria-modal="true" aria-labelledby="wl-mt">
      <div class="wl-mhead"><h2 class="wl-mtitle" id="wl-mt">${wlEscape(this._title())}<b>.</b></h2><button type="button" class="wl-close" data-close="1" data-focus="close" aria-label="Chiudi">${wlIcon('close')}</button></div>
      <div class="wl-mbody"><div class="wl-detail-heading">Sensori</div>${sensors}${this._history(rows)}
        <div class="wl-note">Uno stato non disponibile o sconosciuto non indica che non ci siano perdite. I dati dipendono dai sensori configurati.</div></div>
    </div></div>`;
  }
  _activeKey() {
    const el = this.shadowRoot.activeElement;
    return el && el.getAttribute ? (el.getAttribute('data-focus') || '') : '';
  }
  _paint() {
    if (!this.isConnected) return;
    const now = new Date();
    const rows = this._rows(now);
    const signature = JSON.stringify([this._config, this._hass?.themes?.darkMode, this._isDark(), this._hass?.config?.time_zone,
      rows, this._open, this._hist, this._open ? Math.floor(now.getTime() / 60000) : 0]);
    if (signature === this._lastSignature) return;
    this._lastSignature = signature;
    const wet = rows.filter(r => r.status === 'wet'), na = rows.filter(r => r.status === 'na'), dry = rows.filter(r => r.status === 'dry');
    let cls, icon, big, sub;
    if (!rows.length) { cls = 'wl-na'; icon = 'cancel'; big = 'Nessun sensore'; sub = 'Seleziona i sensori nell’editor della card'; }
    else if (wet.length) { cls = 'wl-wet'; icon = 'alert'; big = 'Perdita rilevata'; sub = `${wet.map(r => r.name).join(', ')} · ${wet[0].when}`; }
    else if (na.length) { cls = 'wl-warn'; icon = 'cancel'; big = 'Controllo incompleto'; sub = `${dry.length} su ${rows.length} asciutti · ${na.length} non disponibil${na.length > 1 ? 'i' : 'e'}`; }
    else { cls = 'wl-ok'; icon = 'water'; big = 'Nessuna perdita'; sub = 'Tutto asciutto'; }
    const c = this._config;
    const showEyebrow = c.show_eyebrow && c.eyebrow, showTitle = c.show_title && c.title;
    const head = showEyebrow || showTitle ? `<div class="wl-head"><div>${showEyebrow ? `<div class="wl-eyebrow">${wlEscape(c.eyebrow)}</div>` : ''}${showTitle ? `<div class="wl-title">${wlEscape(c.title)}<b>.</b></div>` : ''}</div></div>` : '';
    const list = rows.map(r => `<div class="wl-row ${WL_CLASS[r.status]}"><span class="wl-row-orb">${wlIcon(WL_ICON[r.status])}</span>
      <div class="wl-row-t"><div class="wl-row-nm">${wlEscape(r.name)}</div><div class="wl-row-st">${WL_SHORT[r.status]}</div></div>
      ${c.show_last_update ? `<div class="wl-row-r"><span class="lbl">Ultimo aggiornamento</span><strong>${wlEscape(r.when)}</strong></div>` : ''}</div>`).join('');
    const sr = this.shadowRoot, q = sel => sr.querySelector(sel);
    const keepBody = q('.wl-mbody')?.scrollTop || 0;
    const want = this._pendingFocus || this._activeKey();
    this._pendingFocus = '';
    sr.innerHTML = `<style>${WL_CSS}</style>
      <div class="wl-container"><div class="wl-shell ${this._isDark() ? 'wl-dark' : 'wl-light'}">${head}
        <div class="wl-hero ${cls}"><span class="wl-ring">${wlIcon(icon)}</span><div><div class="wl-hero-t">${wlEscape(big)}</div><div class="wl-sub">${wlEscape(sub)}</div></div></div>
        ${rows.length ? `<div class="wl-rows n${Math.min(rows.length, 5)}">${list}</div>` : ''}
        ${c.show_details ? `<div class="wl-foot"><button type="button" class="wl-detail" data-open="1" data-focus="open">Dettagli e stato ${wlIcon('chevron-right')}</button></div>` : ''}
      </div></div>
      ${this._open ? this._popup(rows) : ''}`;
    if (q('.wl-mbody')) q('.wl-mbody').scrollTop = keepBody;
    this._lockScroll();
    if (want) q(`[data-focus="${want}"]`)?.focus({preventScroll: true});
  }
}
const WL_EDITOR_CSS = `
:host{display:block;color:var(--primary-text-color,#18221c);font-family:var(--ha-font-family-body,Roboto,Arial,sans-serif);font-size:var(--ha-font-size-m,14px)}
*,*:before,*:after{box-sizing:border-box}
.wl-editor{display:block}
.wl-tabs{display:flex;gap:5px;overflow-x:auto;padding-bottom:14px;border-bottom:1px solid var(--divider-color,#dfe5df)}
.wl-tab{border:0;background:none;color:var(--secondary-text-color,#536359);border-radius:13px;padding:10px 13px;white-space:nowrap;font:inherit;cursor:pointer}
.wl-tab.active{color:var(--primary-text-color,#17231c);background:var(--secondary-background-color,#f0f2ef);font-weight:650}
.wl-heading{font-size:21px;font-weight:500;margin:25px 0 9px}
.wl-desc{color:var(--secondary-text-color,#55665a);font-size:13px;line-height:1.5;margin-bottom:24px}
.wl-field{display:block;margin:20px 0}
.wl-label{font-size:14px;margin-bottom:10px}
.wl-input{display:block;width:100%;background:var(--secondary-background-color,#f0f2ef);color:var(--primary-text-color,#18221c);border:0;border-bottom:1px solid var(--divider-color,#a5afa5);padding:14px 13px;min-height:50px;border-radius:11px 11px 0 0;font:inherit}
.wl-editor ha-selector{display:block;width:100%;--mdc-theme-primary:var(--primary-color,#0b7457)}
.wl-fallback{display:none}.wl-no-native .wl-fallback{display:block}.wl-no-native ha-selector{display:none}
.wl-row{border-bottom:1px solid var(--divider-color,#e3e7e3);padding:13px 0;display:flex;align-items:center;justify-content:space-between;gap:15px}
.wl-row label{flex:1}.wl-row input[type=checkbox]{width:18px;height:18px;accent-color:var(--primary-color,#0c7157)}
.wl-muted{font-size:12px;line-height:1.5;color:var(--secondary-text-color,#5e6c62)}
.wl-action{background:var(--secondary-background-color,#eff2ee);border:1px solid var(--divider-color,#dbe2db);color:var(--primary-text-color,#18221c);padding:10px 14px;border-radius:14px;font:inherit;cursor:pointer}
.wl-action:disabled{opacity:.45;cursor:not-allowed}
.wl-tiny{font-size:11px;color:var(--secondary-text-color,#55665a);margin:9px 0}
.wl-input:focus-visible,.wl-action:focus-visible,.wl-tab:focus-visible,.wl-clear:focus-visible{outline:2px solid var(--primary-color,#0b7457);outline-offset:2px}
.wl-more{margin:19px 0 10px;border-bottom:1px solid var(--divider-color,#dfe5df);padding:0 0 11px}
.wl-more summary{cursor:pointer;padding:13px 4px;color:var(--secondary-text-color,#56665d);font-size:13px;list-style:none}
.wl-more summary:before{content:"▸";font-size:10px;margin-right:10px}
.wl-more[open] summary:before{content:"▾"}.wl-more summary::-webkit-details-marker{display:none}
.wl-more-body{padding:2px 0 8px}
.wl-selector-line{display:flex;align-items:center;gap:8px;min-width:0}
.wl-selector-grow{flex:1;min-width:0}
.wl-clear{display:flex;align-items:center;justify-content:center;flex:none;width:36px;height:36px;background:var(--secondary-background-color,#eef1ef);border:1px solid var(--divider-color,#dfe5df);border-radius:50%;cursor:pointer;color:var(--secondary-text-color,#57655c);padding:0}
.wl-clear ha-icon{width:18px;height:18px;--mdc-icon-size:18px}
.wl-notice{margin-top:10px;color:var(--error-color,#bd4b42);font-size:12px}
.wl-clear ha-icon{width:18px;height:18px;--mdc-icon-size:18px}
.wl-name{margin-top:8px}
`;
class WaterLeakCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this._config = wlConfig();
    this._hass = null;
    this._tab = 'sensori';
    this._nativeTried = false;
    this._renderScheduled = false;
    this._duringConfigEvent = false;
    this.shadowRoot.addEventListener('click', e => this._click(e));
    this.shadowRoot.addEventListener('change', e => this._change(e));
  }
  set hass(hass) {
    this._hass = hass;
    this.shadowRoot.querySelectorAll('ha-selector').forEach(el => el.hass = hass);
  }
  setConfig(raw) {
    const next = wlConfig(raw);
    if (JSON.stringify(next) === JSON.stringify(this._config) && this.shadowRoot.querySelector('.wl-editor')) return;
    this._config = next;
    if (this._duringConfigEvent || this._renderScheduled) this._scheduleRender();
    else this._render();
  }
  connectedCallback() { this._render(); this._ensureNative(); }
  async _ensureNative() {
    if (this._nativeTried) return;
    this._nativeTried = true;
    if (!customElements.get('ha-selector')) {
      try {
        const helper = await window.loadCardHelpers?.();
        await helper?.importSelector?.();
      } catch {}
    }
    this._render();
  }
  _scheduleRender() {
    if (!this.isConnected || this._renderScheduled) return;
    this._renderScheduled = true;
    const done = () => { this._renderScheduled = false; if (this.isConnected) this._render(); };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(done);
    else Promise.resolve().then(done);
  }
  _update(patch) {
    const next = wlConfig({...this._config, ...patch});
    if (JSON.stringify(next) === JSON.stringify(this._config)) return;
    this._config = next;
    this._duringConfigEvent = true;
    try {
      this.dispatchEvent(new CustomEvent('config-changed', {detail: {config: this._config}, bubbles: true, composed: true}));
    } finally {
      this._duringConfigEvent = false;
      this._scheduleRender();
    }
  }
  _field(label, inner, help = '') {
    return `<div class="wl-field"><div class="wl-label">${wlEscape(label)}</div>${inner}${help ? `<div class="wl-tiny">${wlEscape(help)}</div>` : ''}</div>`;
  }
  _text(key, label, max = 70, enabled = true) {
    return this._field(label, `<input class="wl-input" type="text" maxlength="${max}" data-key="${key}" value="${wlEscape(this._config[key] || '')}" ${enabled ? '' : 'disabled'}/>`);
  }
  _select(key, label, options) {
    return this._field(label, `<select class="wl-input" data-key="${key}">
      ${options.map(([value, caption]) => `<option value="${value}" ${this._config[key] === value ? 'selected' : ''}>${wlEscape(caption)}</option>`).join('')}
    </select>`);
  }
  _check(key, label, help = '') {
    return `<div class="wl-row"><label for="wl-${key}">${wlEscape(label)}
      ${help ? `<div class="wl-muted">${wlEscape(help)}</div>` : ''}</label>
      <input type="checkbox" id="wl-${key}" data-key="${key}" ${this._config[key] ? 'checked' : ''}/></div>`;
  }
  _sensors() {
    const list = this._config.entities;
    let body = '<div class="wl-heading">Sensori di perdita</div>' +
      '<div class="wl-desc">Cerca i binary_sensor in Home Assistant e scegli quali mostrare. Puoi cambiare il nome mostrato.</div>';
    if (!list.length) body += '<div class="wl-muted" style="margin-bottom:14px">Nessun sensore selezionato.</div>';
    list.forEach((item, i) => {
      const field = `<div class="wl-selector-line"><div class="wl-selector-grow">
          <div data-entity-slot="${i}"></div>
          <div class="wl-fallback"><input class="wl-input" type="text" data-entity-index="${i}" placeholder="binary_sensor.*" value="${wlEscape(item.entity)}"/></div>
        </div><button type="button" class="wl-clear" data-remove="${i}" aria-label="Rimuovi sensore ${i + 1}" title="Rimuovi sensore ${i + 1}">${wlIcon('close')}</button></div>
        <input class="wl-input wl-name" type="text" maxlength="60" data-name-index="${i}" placeholder="Nome mostrato" aria-label="Nome sensore ${i + 1}" value="${wlEscape(item.name)}"/>`;
      body += this._field(`Sensore ${i + 1}`, field);
    });
    body += this._field('Aggiungi sensore', `<div data-entity-slot="add"></div>
      <div class="wl-fallback"><input class="wl-input" type="text" data-add-input="1" placeholder="binary_sensor.*" value=""/></div>`);
    return body;
  }
  _content() {
    if (this._tab === 'sensori') return this._sensors();
    const c = this._config;
    return '<div class="wl-heading">Aspetto Edera</div><div class="wl-desc">Personalizza etichetta, titolo e tema mantenendo lo stile Edera Light/Dark.</div>' +
      this._check('show_eyebrow', 'Mostra etichetta superiore') + this._text('eyebrow', 'Testo etichetta', 60, c.show_eyebrow) +
      this._check('show_title', 'Mostra titolo') + this._text('title', 'Testo titolo', 60, c.show_title) +
      this._select('theme_mode', 'Tema', [['auto', 'Automatico (Home Assistant)'], ['light', 'Light Edera'], ['dark', 'Dark Edera']]) +
      this._check('show_last_update', 'Mostra l’ultimo aggiornamento sui sensori') +
      this._check('show_details', 'Mostra il pulsante «Dettagli e stato»') +
      this._check('show_history', 'Mostra le segnalazioni recenti nel popup') +
      '<div class="wl-muted" style="padding-top:9px">Le segnalazioni usano lo storico di Home Assistant (ultimi 30 giorni), solo se disponibile.</div>';
  }
  _click(event) {
    const tab = event.target.closest('[data-tab]');
    if (tab) { this._tab = tab.dataset.tab; this._render(); return; }
    const remove = event.target.closest('[data-remove]');
    if (remove) this._update({entities: this._config.entities.filter((_, i) => i !== Number(remove.dataset.remove))});
  }
  _setEntity(index, value) {
    const id = wlEntityId(value), list = this._config.entities.map(e => ({...e}));
    if (!id) { list.splice(index, 1); this._update({entities: list}); return; }
    if (list.some((e, i) => i !== index && e.entity === id)) { this._render(); return; }
    list[index] = {...list[index], entity: id};
    this._update({entities: list});
  }
  _addEntity(value) {
    const id = wlEntityId(value);
    if (!id || this._config.entities.some(e => e.entity === id)) { this._render(); return; }
    this._update({entities: [...this._config.entities, {entity: id, name: ''}]});
  }
  _change(event) {
    const input = event.target;
    if (!input) return;
    if (input.dataset?.nameIndex !== undefined) {
      const list = this._config.entities.map(e => ({...e})), i = Number(input.dataset.nameIndex);
      if (list[i]) { list[i].name = input.value; this._update({entities: list}); }
      return;
    }
    if (input.dataset?.entityIndex !== undefined) { this._setEntity(Number(input.dataset.entityIndex), input.value); return; }
    if (input.dataset?.addInput !== undefined) { this._addEntity(input.value); return; }
    const key = input.dataset?.key;
    if (!key) return;
    const value = input.type === 'checkbox' ? input.checked : input.value;
    if (['title', 'eyebrow', 'theme_mode', 'show_eyebrow', 'show_title', 'show_last_update', 'show_details', 'show_history'].includes(key)) this._update({[key]: value});
  }
  _render() {
    if (!this.isConnected) return;
    const tabs = [['sensori', 'Sensori'], ['aspetto', 'Aspetto']];
    this.shadowRoot.innerHTML = `<style>${WL_EDITOR_CSS}</style>
      <div class="wl-editor"><div class="wl-tabs">${tabs.map(([id, label]) => `<button type="button" class="wl-tab ${this._tab === id ? 'active' : ''}"
      data-tab="${id}" aria-pressed="${id === this._tab}">${label}</button>`).join('')}</div>${this._content()}</div>`;
    const root = this.shadowRoot.querySelector('.wl-editor');
    if (!customElements.get('ha-selector')) { root.classList.add('wl-no-native'); return; }
    this.shadowRoot.querySelectorAll('[data-entity-slot]').forEach(slot => {
      const key = slot.dataset.entitySlot, isAdd = key === 'add';
      const el = document.createElement('ha-selector');
      el.hass = this._hass; el.selector = {entity: {domain: 'binary_sensor'}};
      el.value = isAdd ? '' : (this._config.entities[Number(key)]?.entity || '');
      el.setAttribute('aria-label', isAdd ? 'Aggiungi sensore' : `Sensore ${Number(key) + 1}`);
      el.addEventListener('value-changed', event => {
        event.stopPropagation();
        if (!event.detail || !Object.prototype.hasOwnProperty.call(event.detail, 'value')) return;
        if (isAdd) this._addEntity(event.detail.value);
        else this._setEntity(Number(key), event.detail.value);
      });
      slot.appendChild(el);
    });
  }
}
if (!customElements.get(WL_TAG)) customElements.define(WL_TAG, WaterLeakCard);
if (!customElements.get(WL_EDITOR_TAG)) customElements.define(WL_EDITOR_TAG, WaterLeakCardEditor);
if (typeof window !== 'undefined') {
  window.customCards = window.customCards || [];
  if (!window.customCards.some(card => card.type === WL_TAG)) {
    window.customCards.push({type: WL_TAG, name: 'Water Leak Card', description: 'Stato dei sensori di perdita acqua in stile Edera.', preview: true});
  }
}
