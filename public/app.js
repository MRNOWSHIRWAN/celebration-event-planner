'use strict';
const form = document.getElementById('form');
const plan = document.getElementById('plan');
const statusEl = document.getElementById('status');
const errEl = document.getElementById('formerr');
const go = document.getElementById('go');
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
  for (const k of kids) n.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return n;
}
function card(title, ...kids) { return el('section', { class: 'card' }, el('h2', {}, title), ...kids); }
function list(items) { return el('ul', {}, ...items.map((i) => el('li', {}, i))); }

function checklistNodes(groups) {
  const out = [];
  groups.forEach((c, g) => {
    out.push(el('h3', {}, c.category));
    const ul = el('ul', { class: 'check' });
    c.items.forEach((it, n) => {
      const id = `c-${g}-${n}`;
      const cb = el('input', { type: 'checkbox', id });
      cb.style.display = 'inline-block';
      cb.style.width = 'auto';
      ul.append(el('li', {}, el('label', { for: id }, cb, ' ' + it)));
    });
    out.push(ul);
  });
  return out;
}

function render(d) {
  plan.replaceChildren();
  const i = d.input;
  plan.append(el('h2', {}, `Your ${i.eventType} plan for ${i.guests} guests`));
  const rows = d.budget.lines.map((l) => el('tr', {}, el('td', {}, l.category), el('td', { class: 'n' }, `${l.percent}%`), el('td', { class: 'n' }, inr.format(l.amount)), el('td', {}, el('div', { class: 'bar', 'aria-hidden': 'true' }, (() => { const b = el('i'); b.style.width = l.percent * 3 + '%'; return b; })()))));
  plan.append(card('Budget', el('p', {}, `Total ${inr.format(d.budget.total)}, about ${inr.format(d.budget.perGuest)} per guest.`),
    el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Category'), el('th', { class: 'n' }, 'Share'), el('th', { class: 'n' }, 'Amount'), el('th', {}, ''))), el('tbody', {}, ...rows))));
  const t = d.timeline;
  const tl = [];
  if (t.tight) tl.push(el('p', { class: 'warn' }, `Only ${t.daysLeft} days left. Tasks that would normally start earlier are moved to today. Start with those.`));
  tl.push(el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Do by'), el('th', {}, 'Task'))), el('tbody', {}, ...t.rows.map((r) => el('tr', {}, el('td', {}, r.due), el('td', {}, r.task + (r.note ? ' (' + r.note + ')' : '')))))));
  plan.append(card('Timeline', ...tl));
  if (!d.ai) {
    plan.append(card('AI ideas and checklist', el('p', { class: 'warn', role: 'alert' }, 'The AI part could not run: ' + (d.aiError || 'unknown error') + '. The budget and timeline above are still valid. Try again in a minute.')));
  } else {
    plan.append(card('Personalised ideas', el('ul', {}, ...d.ai.ideas.map((x) => el('li', {}, el('strong', {}, x.title), ' - ' + x.why)))));
    plan.append(card('Vendor and task checklist', ...checklistNodes(d.ai.checklist)));
    plan.append(card('Questions to ask every vendor', list(d.ai.vendor_questions)));
    if (d.ai.tips.length) plan.append(card('Tips', list(d.ai.tips)));
  }
  plan.hidden = false;
  plan.focus();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errEl.textContent = '';
  const data = Object.fromEntries(new FormData(form));
  go.disabled = true;
  statusEl.textContent = 'Planning... this takes a few seconds.';
  try {
    const res = await fetch('/api/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const body = await res.json();
    if (res.status === 422) { errEl.textContent = body.errors.join(' '); statusEl.textContent = ''; return; }
    if (!res.ok) { errEl.textContent = body.error || 'Something went wrong.'; statusEl.textContent = ''; return; }
    render(body);
    statusEl.textContent = 'Plan ready.';
  } catch {
    errEl.textContent = 'Could not reach the server. Check your connection and try again.';
    statusEl.textContent = '';
  } finally { go.disabled = false; }
});
