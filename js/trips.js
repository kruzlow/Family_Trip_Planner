let allTrips = [];
let currentAttractions = []; // {name, description, ai_generated, selected}

function showToast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.textContent = msg;
  document.getElementById('toastContainer').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function fmtDate(d) {
  if (!d) return '—';
  return d.slice(0, 10);
}

function fmtCurrency(n, cur) {
  if (!n) return '—';
  return (cur || 'SGD') + ' ' + Number(n).toLocaleString();
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function loadTrips() {
  try {
    const res = await fetch('/api/trip-planning/trips');
    const data = await res.json();
    allTrips = data.trips || [];
    renderStats();
    renderTable();
  } catch (e) {
    showToast('Failed to load trips', 'error');
  }
}

function renderStats() {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('statTotal').textContent = allTrips.length;
  const travelers = allTrips.reduce((s, t) => s + (t.travelers.adults || 0) + (t.travelers.children || 0), 0);
  document.getElementById('statTravelers').textContent = travelers;
  const budget = allTrips.reduce((s, t) => s + (t.budget.total_budget || 0), 0);
  document.getElementById('statBudget').textContent = budget ? 'SGD ' + budget.toLocaleString() : '0';
  const upcoming = allTrips.filter(t => t.start_date && t.start_date >= today).length;
  document.getElementById('statUpcoming').textContent = upcoming;
}

function renderTable() {
  const tbody = document.getElementById('tripsBody');
  if (!allTrips.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><p>No trips yet. Click + New Trip to get started.</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = allTrips.map(t => {
    const dates = (t.start_date || t.end_date) ? fmtDate(t.start_date) + ' – ' + fmtDate(t.end_date) : '—';
    const travelers = (t.travelers.adults || 0) + (t.travelers.children || 0);
    const budget = fmtCurrency(t.budget.total_budget, t.budget.currency);
    return `<tr>
      <td><strong>${esc(t.name)}</strong></td>
      <td>${esc(t.country) || '—'}</td>
      <td>${dates}</td>
      <td>${travelers}</td>
      <td>${budget}</td>
      <td class="table-actions">
        <button class="btn btn-ghost btn-sm" onclick="openEditModal('${t.trip_id}')">Edit</button>
        <button class="btn btn-primary btn-sm" onclick="openTrip('${t.trip_id}')">Open</button>
      </td>
    </tr>`;
  }).join('');
}

function openTrip(id) {
  localStorage.setItem('family-trip-selected', id);
  window.location.href = 'itinerary.html';
}

function openNewModal() {
  document.getElementById('modalTitle').textContent = 'New Trip';
  document.getElementById('editId').value = '';
  document.getElementById('deleteBtn').style.display = 'none';
  clearForm();
  document.getElementById('tripModal').classList.add('open');
}

function openEditModal(id) {
  const trip = allTrips.find(t => t.trip_id === id);
  if (!trip) return;
  document.getElementById('modalTitle').textContent = 'Edit Trip';
  document.getElementById('editId').value = id;
  document.getElementById('deleteBtn').style.display = '';
  document.getElementById('fName').value = trip.name || '';
  document.getElementById('fCountry').value = trip.country || '';
  document.getElementById('fStart').value = trip.start_date || '';
  document.getElementById('fEnd').value = trip.end_date || '';
  document.getElementById('fAdults').value = trip.travelers.adults || 0;
  document.getElementById('fChildren').value = trip.travelers.children || 0;
  document.getElementById('fCurrency').value = trip.budget.currency || 'SGD';
  document.getElementById('fBudget').value = trip.budget.total_budget || 0;

  // Restore attractions
  currentAttractions = (trip.attractions || []).map(a => ({ ...a }));
  renderAttractionsList();

  // Restore advisory tables
  renderAvoidRows(trip.periods_to_avoid || []);
  renderRecommendRows(trip.periods_recommended || []);

  document.getElementById('tripModal').classList.add('open');
}

function closeModal() {
  document.getElementById('tripModal').classList.remove('open');
}

function clearForm() {
  ['fName','fCountry','fStart','fEnd'].forEach(id => document.getElementById(id).value = '');
  ['fAdults','fChildren','fBudget'].forEach(id => document.getElementById(id).value = 0);
  document.getElementById('fCurrency').value = 'SGD';
  currentAttractions = [];
  renderAttractionsList();
  renderAvoidRows([]);
  renderRecommendRows([]);
  document.getElementById('attractionsStatus').textContent = '';
  document.getElementById('advisoryStatus').textContent = '';
  document.getElementById('customAttractionRow').style.display = 'none';
}

// ── Attractions ───────────────────────────────────────────────────────────────

function renderAttractionsList() {
  const el = document.getElementById('attractionsList');
  if (!currentAttractions.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--color-text-muted);font-style:italic">No attractions yet. Click Generate or add manually.</div>';
    return;
  }
  el.innerHTML = currentAttractions.map((a, i) => `
    <div class="attraction-item">
      <input type="checkbox" ${a.selected !== false ? 'checked' : ''} onchange="toggleAttraction(${i}, this.checked)">
      <div class="attraction-item-body">
        <div class="attraction-item-name">${esc(a.name)}${a.ai_generated ? ' <span style="font-size:10px;color:var(--color-text-muted);font-weight:400">✦ AI</span>' : ''}</div>
        ${a.description ? `<div class="attraction-item-desc">${esc(a.description)}</div>` : ''}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="removeAttraction(${i})" style="font-size:11px;padding:2px 6px;color:var(--color-danger)">✕</button>
    </div>
  `).join('');
}

function toggleAttraction(idx, checked) {
  if (currentAttractions[idx]) currentAttractions[idx].selected = checked;
}

function removeAttraction(idx) {
  currentAttractions.splice(idx, 1);
  renderAttractionsList();
}

function toggleCustomRow() {
  const row = document.getElementById('customAttractionRow');
  row.style.display = row.style.display === 'none' ? 'flex' : 'none';
  if (row.style.display === 'flex') document.getElementById('customAttractionInput').focus();
}

function addCustomAttraction() {
  const input = document.getElementById('customAttractionInput');
  const name = input.value.trim();
  if (!name) return;
  currentAttractions.push({ name, description: '', ai_generated: false, selected: true });
  input.value = '';
  renderAttractionsList();
}

async function generateAttractions() {
  const country = document.getElementById('fCountry').value.trim();
  if (!country) { showToast('Enter a country first', 'error'); return; }
  const btn = document.getElementById('genAttractionsBtn');
  const status = document.getElementById('attractionsStatus');
  btn.disabled = true;
  status.textContent = 'Generating…';
  try {
    const res = await fetch('/api/trip-planning/ai/attractions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country })
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    const data = await res.json();
    const newAttractions = (data.attractions || []).map(a => ({ ...a, ai_generated: true, selected: true }));
    // Merge: keep existing custom ones, add new AI ones that aren't already there
    const existingNames = currentAttractions.map(a => a.name.toLowerCase());
    for (const a of newAttractions) {
      if (!existingNames.includes(a.name.toLowerCase())) currentAttractions.push(a);
    }
    renderAttractionsList();
    status.textContent = `${newAttractions.length} attractions generated`;
  } catch (e) {
    showToast('Failed to generate attractions: ' + e.message, 'error');
    status.textContent = '';
  } finally {
    btn.disabled = false;
  }
}

// ── Advisory Tables ───────────────────────────────────────────────────────────

function renderAvoidRows(rows) {
  // Note: input values are collected on save via getAvoidRows() which reads live from the DOM.
  // No onchange handler is needed — values are read directly from inputs at save time.
  const tbody = document.getElementById('avoidBody');
  tbody.innerHTML = rows.map((r, i) => `<tr>
    <td><input value="${esc(r.period)}" placeholder="e.g. Jun–Aug"></td>
    <td><input value="${esc(r.reason)}" placeholder="Reason…"></td>
    <td><button class="btn btn-ghost btn-sm" onclick="removeAvoidRow(${i})" style="font-size:11px;color:var(--color-danger)">✕</button></td>
  </tr>`).join('');
}

function renderRecommendRows(rows) {
  // Note: input values are collected on save via getRecommendRows() which reads live from the DOM.
  // No onchange handler is needed — values are read directly from inputs at save time.
  const tbody = document.getElementById('recommendBody');
  tbody.innerHTML = rows.map((r, i) => `<tr>
    <td><input value="${esc(r.period)}" placeholder="e.g. Mar–May"></td>
    <td><input value="${esc(r.reason)}" placeholder="Reason…"></td>
    <td><button class="btn btn-ghost btn-sm" onclick="removeRecommendRow(${i})" style="font-size:11px;color:var(--color-danger)">✕</button></td>
  </tr>`).join('');
}

function getAvoidRows() {
  const rows = [];
  document.querySelectorAll('#avoidBody tr').forEach(tr => {
    const inputs = tr.querySelectorAll('input');
    if (inputs[0].value.trim() || inputs[1].value.trim())
      rows.push({ period: inputs[0].value.trim(), reason: inputs[1].value.trim() });
  });
  return rows;
}

function getRecommendRows() {
  const rows = [];
  document.querySelectorAll('#recommendBody tr').forEach(tr => {
    const inputs = tr.querySelectorAll('input');
    if (inputs[0].value.trim() || inputs[1].value.trim())
      rows.push({ period: inputs[0].value.trim(), reason: inputs[1].value.trim() });
  });
  return rows;
}

function addAvoidRow() {
  const rows = getAvoidRows();
  rows.push({ period: '', reason: '' });
  renderAvoidRows(rows);
}

function addRecommendRow() {
  const rows = getRecommendRows();
  rows.push({ period: '', reason: '' });
  renderRecommendRows(rows);
}

function removeAvoidRow(idx) {
  const rows = getAvoidRows();
  rows.splice(idx, 1);
  renderAvoidRows(rows);
}

function removeRecommendRow(idx) {
  const rows = getRecommendRows();
  rows.splice(idx, 1);
  renderRecommendRows(rows);
}

async function generateAdvisory() {
  const country = document.getElementById('fCountry').value.trim();
  if (!country) { showToast('Enter a country first', 'error'); return; }
  const btn = document.getElementById('genAdvisoryBtn');
  const status = document.getElementById('advisoryStatus');
  btn.disabled = true;
  status.textContent = 'Generating…';
  try {
    const res = await fetch('/api/trip-planning/ai/travel-advisory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country })
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    const data = await res.json();
    renderAvoidRows(data.periods_to_avoid || []);
    renderRecommendRows(data.periods_recommended || []);
    status.textContent = 'Advisory generated';
  } catch (e) {
    showToast('Failed to generate advisory: ' + e.message, 'error');
    status.textContent = '';
  } finally {
    btn.disabled = false;
  }
}

// ── Save / Delete ─────────────────────────────────────────────────────────────

async function saveTrip() {
  const name = document.getElementById('fName').value.trim();
  if (!name) { showToast('Trip name is required', 'error'); return; }

  const payload = {
    name,
    country: document.getElementById('fCountry').value.trim(),
    start_date: document.getElementById('fStart').value,
    end_date: document.getElementById('fEnd').value,
    travelers: {
      adults: Number(document.getElementById('fAdults').value) || 0,
      children: Number(document.getElementById('fChildren').value) || 0
    },
    budget: {
      currency: document.getElementById('fCurrency').value,
      total_budget: Number(document.getElementById('fBudget').value) || 0
    },
    attractions: currentAttractions,
    periods_to_avoid: getAvoidRows(),
    periods_recommended: getRecommendRows()
  };

  const id = document.getElementById('editId').value;
  try {
    const url = id ? `/api/trip-planning/trips/${id}` : '/api/trip-planning/trips';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error();
    closeModal();
    showToast(id ? 'Trip updated' : 'Trip created', 'success');
    await loadTrips();
  } catch {
    showToast('Save failed', 'error');
  }
}

async function deleteTrip() {
  const id = document.getElementById('editId').value;
  if (!id) return;
  if (!confirm('Delete this trip? This cannot be undone.')) return;
  try {
    const res = await fetch(`/api/trip-planning/trips/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    closeModal();
    showToast('Trip deleted');
    await loadTrips();
  } catch {
    showToast('Delete failed', 'error');
  }
}

loadTrips();
