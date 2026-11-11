import { fetchIncidents, ack } from './api.js';
import { formatLocal } from './time.js';

const REFRESH_MS = 2000; // R4

const $ = (sel) => document.querySelector(sel);
const list = $('[data-testid="incident-list"]');
const loader = $('[data-testid="loader"]');
const empty = $('[data-testid="empty"]');
const errorBox = $('[data-role="error"]');
const status = $('[data-role="status"]');

const rows = new Map(); // incident id -> <li>, kept across refreshes so acks and focus survive
const acked = new Map(); // incident id -> ack reply

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function markAcked(row, reply) {
  const cell = row.querySelector('.act');
  cell.replaceChildren(el('span', { 'data-testid': 'acked', class: 'acked', title: reply.ackedAt }, 'Acked'));
  row.classList.add('is-acked');
}

function buildRow(i) {
  const row = el('li', { 'data-testid': 'incident-row', 'data-id': i.id, class: `row ${i.severity}` });
  row.append(
    el('span', { class: 'id' }, i.id),
    el('span', { class: 'sev' }, i.severity),
    el('span', { class: 'what' }, `${i.service} · ${i.region} · ${i.summary}`),
    el('time', { datetime: i.openedAt, title: i.openedAt }, formatLocal(i.openedAt)),
  );
  const act = el('span', { class: 'act' });
  const btn = el('button', { type: 'button', 'data-testid': 'ack', 'aria-label': `Ack ${i.id}` }, 'Ack');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Acking…';
    try {
      const reply = await ack(i.id); // R2: acks exactly this row's incident
      acked.set(i.id, reply);
      markAcked(row, reply);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Ack';
      showError(`Ack failed for ${i.id}: ${err.message}`);
    }
  });
  act.append(btn);
  row.append(act);
  if (acked.has(i.id)) markAcked(row, acked.get(i.id));
  return row;
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = !msg;
}

// R1: newest first. Existing rows are moved, not rebuilt, so an ack in flight or a mark is never lost.
function render(incidents) {
  const seen = new Set();
  let prev = null;
  for (const i of incidents) {
    seen.add(i.id);
    let row = rows.get(i.id);
    if (!row) {
      row = buildRow(i);
      rows.set(i.id, row);
    }
    const want = prev ? prev.nextSibling : list.firstChild;
    if (row !== want) list.insertBefore(row, want);
    prev = row;
  }
  for (const [id, row] of rows) {
    if (!seen.has(id)) {
      row.remove();
      rows.delete(id);
    }
  }
  loader.remove(); // R3: gone once incidents load
  empty.hidden = incidents.length > 0;
  list.hidden = incidents.length === 0;
}

async function tick() {
  try {
    const page = await fetchIncidents();
    render(page.incidents);
    showError('');
    status.textContent = `updated ${formatLocal(page.updatedAt)}`;
  } catch (err) {
    showError(`Could not refresh: ${err.message}`);
  } finally {
    setTimeout(tick, REFRESH_MS); // R4: keeps refreshing while open; never overlaps a slow request
  }
}

tick();
