let currentTripId = localStorage.getItem('family-trip-selected') || '';
let currentTrip = null;

const CATEGORIES = ['accommodations', 'travel', 'food', 'activities', 'others'];
const CAT_LABELS = { accommodations: 'Accommodations', travel: 'Travel', food: 'Food', activities: 'Activities', others: 'Others' };

function showToast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.textContent = msg;
  document.getElementById('toastContainer').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function fmt(n, cur) {
  return (cur || '') + ' ' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

async function loadTrips() {
  try {
    const res = await fetch('/api/trip-planning/trips');
    const data = await res.json();
    const sel = document.getElementById('tripSelect');
    sel.innerHTML = '<option value="">Select a trip…</option>';
    (data.trips || []).forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.trip_id;
      opt.textContent = t.name;
      if (t.trip_id === currentTripId) opt.selected = true;
      sel.appendChild(opt);
    });
    if (currentTripId) {
      currentTrip = (data.trips || []).find(t => t.trip_id === currentTripId) || null;
      renderBudget();
    } else {
      showNoTrip();
    }
  } catch {
    showToast('Failed to load trips', 'error');
  }
}

function onTripChange(id) {
  currentTripId = id;
  localStorage.setItem('family-trip-selected', id);
  fetch('/api/trip-planning/trips').then(r => r.json()).then(data => {
    currentTrip = (data.trips || []).find(t => t.trip_id === id) || null;
    renderBudget();
  });
}

function showNoTrip() {
  document.getElementById('noTripBanner').style.display = '';
  document.getElementById('budgetContent').style.display = 'none';
  document.getElementById('genBudgetBtn').style.display = 'none';
}

function renderBudget() {
  if (!currentTrip) { showNoTrip(); return; }
  document.getElementById('noTripBanner').style.display = 'none';
  document.getElementById('budgetContent').style.display = '';
  document.getElementById('genBudgetBtn').style.display = '';

  const budget = currentTrip.budget || {};
  const bb = currentTrip.budget_breakdown || {};
  const cur = budget.currency || 'SGD';
  const totalBudget = Number(budget.total_budget) || 0;

  // Total budget card
  document.getElementById('totalBudgetValue').textContent = fmt(totalBudget, cur);
  document.getElementById('totalBudgetSub').textContent = currentTrip.country ? `Trip to ${currentTrip.country}` : '';

  // Breakdown rows
  let totalEstimated = 0;
  let totalActual = 0;

  const tbody = document.getElementById('breakdownBody');
  tbody.innerHTML = CATEGORIES.map(cat => {
    const row = bb[cat] || { estimated: 0, actual: 0 };
    const est = Number(row.estimated) || 0;
    const act = Number(row.actual) || 0;
    const rem = est - act;
    totalEstimated += est;
    totalActual += act;
    const remClass = rem >= 0 ? 'remaining-positive' : 'remaining-negative';
    return `<tr>
      <td class="cat-name">${CAT_LABELS[cat]}</td>
      <td class="editable-cell" onclick="startEdit(this, '${cat}', 'estimated', ${est})">${fmt(est, cur)}</td>
      <td class="editable-cell" onclick="startEdit(this, '${cat}', 'actual', ${act})">${fmt(act, cur)}</td>
      <td class="${remClass}">${rem >= 0 ? '' : '-'}${fmt(Math.abs(rem), cur)}</td>
    </tr>`;
  }).join('');

  // Footer summary
  const totalRem = totalEstimated - totalActual;
  const footRemClass = totalRem >= 0 ? 'remaining-positive' : 'remaining-negative';
  document.getElementById('breakdownFoot').innerHTML = `<tr class="summary-row">
    <td>Total</td>
    <td>${fmt(totalEstimated, cur)}</td>
    <td>${fmt(totalActual, cur)}</td>
    <td class="${footRemClass}">${totalRem >= 0 ? '' : '-'}${fmt(Math.abs(totalRem), cur)}</td>
  </tr>`;

  // Progress bar — use token-based CSS classes for threshold colors
  const pct = totalBudget > 0 ? Math.min(Math.round((totalActual / totalBudget) * 100), 999) : 0;
  const displayPct = Math.min(pct, 100);
  const fillClass = pct >= 100 ? 'fill-danger' : pct >= 80 ? 'fill-warning' : 'fill-ok';
  const progressFill = document.getElementById('progressFill');
  const progressPct = document.getElementById('progressPct');
  progressFill.style.width = displayPct + '%';
  progressFill.className = 'progress-fill ' + fillClass;
  progressPct.textContent = pct + '%';
  progressPct.className = 'progress-pct ' + fillClass;
}

function startEdit(cell, cat, field, currentVal) {
  if (cell.querySelector('input')) return; // already editing
  const cur = (currentTrip && currentTrip.budget && currentTrip.budget.currency) || 'SGD';
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.value = currentVal;
  input.style.width = '100%';
  cell.innerHTML = '';
  cell.appendChild(input);
  input.focus();
  input.select();

  async function commit() {
    const newVal = Number(input.value) || 0;
    cell.textContent = fmt(newVal, cur);
    await saveBreakdown(cat, field, newVal);
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { input.blur(); }
    if (e.key === 'Escape') { cell.textContent = fmt(currentVal, cur); }
  });
}

async function saveBreakdown(cat, field, value) {
  if (!currentTrip) return;
  const bb = JSON.parse(JSON.stringify(currentTrip.budget_breakdown || {}));
  if (!bb[cat]) bb[cat] = { estimated: 0, actual: 0 };
  bb[cat][field] = value;

  try {
    const res = await fetch(`/api/trip-planning/trips/${currentTrip.trip_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budget_breakdown: bb })
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    currentTrip = data.trip;
    renderBudget();
  } catch {
    showToast('Save failed', 'error');
  }
}

async function generateBudgetEstimate() {
  if (!currentTripId) { showToast('No trip selected', 'error'); return; }
  const btn = document.getElementById('genBudgetBtn');
  btn.disabled = true;
  btn.textContent = 'Generating…';
  try {
    const res = await fetch('/api/trip-planning/ai/budget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trip_id: currentTripId })
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    const data = await res.json();
    // Merge updated budget_breakdown into currentTrip
    currentTrip = { ...currentTrip, budget_breakdown: data.budget_breakdown };
    renderBudget();
    showToast('Budget estimates generated', 'success');
  } catch (e) {
    showToast('Failed to generate budget: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '✦ Generate Budget Estimate';
  }
}

loadTrips();
