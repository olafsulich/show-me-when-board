import { fetchIncidents, ack } from './api.js';
import { formatLocal } from './time.js';

const REFRESH_MS = 2000; // R4

const $ = (sel) => document.querySelector(sel);
const list = $('[data-testid="incident-list"]');
const loader = $('[data-testid="loader"]');
const empty = $('[data-testid="empty"]');
const errorBox = $('[data-role="error"]');
const status = $('[data-role="status"]');
const panel = $('[data-testid="incident-panel"]');

const incidents = new Map(); // incident id -> incident
const rows = new Map(); // incident id -> <li>, kept across refreshes (never rebuilt, never dropped)
const acked = new Map(); // incident id -> ack reply
let openId = null; // the incident the panel names; refreshes never change it

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = !msg;
}

// --- rows: a row only opens its incident panel; Ack lives in the panel (product's decision, step 2) ---

function markRowAcked(row, reply) {
  if (row.querySelector('[data-testid="acked"]')) return;
  row.querySelector('.act').replaceChildren(el('span', { 'data-testid': 'acked', class: 'acked', title: reply.ackedAt }, 'Acked'));
  row.classList.add('is-acked');
}

function buildRow(i) {
  const row = el('li', {
    'data-testid': 'incident-row',
    'data-id': i.id,
    class: `row ${i.severity}`,
    role: 'button',
    tabindex: '0',
    'aria-label': `Open ${i.id}: ${i.service}, ${i.summary}`,
    'aria-controls': 'incident-panel',
  });
  row.append(
    el('span', { class: 'id' }, i.id),
    el('span', { class: 'sev' }, i.severity),
    el('span', { class: 'what' }, `${i.service} · ${i.region} · ${i.summary}`),
    el('time', { datetime: i.openedAt, title: i.openedAt }, formatLocal(i.openedAt)),
    el('span', { class: 'act' }),
  );
  row.addEventListener('click', () => openPanel(i.id));
  row.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPanel(i.id);
    }
  });
  if (acked.has(i.id)) markRowAcked(row, acked.get(i.id));
  return row;
}

// R1: newest first, live at the top. Existing rows are moved, not rebuilt.
function render(list_) {
  for (const i of list_) incidents.set(i.id, i);
  const ordered = [...incidents.values()].sort((a, b) => (a.openedAt < b.openedAt ? 1 : a.openedAt > b.openedAt ? -1 : 0));
  let prev = null;
  for (const i of ordered) {
    let row = rows.get(i.id);
    if (!row) {
      row = buildRow(i);
      rows.set(i.id, row);
    }
    const want = prev ? prev.nextSibling : list.firstChild;
    if (row !== want) list.insertBefore(row, want);
    prev = row;
  }
  loader.remove(); // R3: gone once incidents load
  empty.hidden = ordered.length > 0;
  list.hidden = ordered.length === 0;
}

// --- the incident panel: names one incident; its Ack acks exactly that one ---

const pf = (role) => panel.querySelector(`[data-role="${role}"]`);

function openPanel(id) {
  const i = incidents.get(id);
  if (!i) return;
  openId = id;
  for (const [rid, row] of rows) row.classList.toggle('is-open', rid === id);
  pf('panel-id').textContent = i.id;
  pf('panel-sev').textContent = i.severity;
  pf('panel-sev').className = `panel-sev ${i.severity}`;
  pf('panel-service').textContent = i.service;
  pf('panel-region').textContent = i.region;
  pf('panel-summary').textContent = i.summary;
  const t = pf('panel-time');
  t.setAttribute('datetime', i.openedAt);
  t.textContent = formatLocal(i.openedAt);
  renderPanelAct();
  panel.hidden = false;
}

function renderPanelAct() {
  const act = pf('panel-act');
  const id = openId;
  if (acked.has(id)) {
    act.replaceChildren(el('p', { 'data-testid': 'acked', class: 'acked' }, `Acked ${id} at ${formatLocal(acked.get(id).ackedAt)}`));
    return;
  }
  const btn = el('button', { type: 'button', 'data-testid': 'panel-ack', class: 'panel-ack' }, `Ack ${id}`);
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = `Acking ${id}…`;
    try {
      const reply = await ack(id); // acks the incident this panel names, nothing else
      acked.set(id, reply);
      markRowAcked(rows.get(id), reply);
      if (openId === id) renderPanelAct();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = `Ack ${id}`;
      showError(`Ack failed for ${id}: ${err.message}`);
    }
  });
  act.replaceChildren(btn);
}

function closePanel() {
  panel.hidden = true;
  rows.get(openId)?.classList.remove('is-open');
  rows.get(openId)?.focus();
  openId = null;
}
pf('panel-close').addEventListener('click', closePanel);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !panel.hidden) closePanel();
});

// --- R4: refresh every 2 s while open ---

async function tick() {
  try {
    const page = await fetchIncidents();
    render(page.incidents);
    showError('');
    status.textContent = `updated ${formatLocal(page.updatedAt)}`;
  } catch (err) {
    showError(`Could not refresh: ${err.message}`);
  } finally {
    setTimeout(tick, REFRESH_MS); // never overlaps a slow request
  }
}

tick();
