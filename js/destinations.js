let currentTripId = localStorage.getItem('family-trip-selected') || '';
let allStudies = [];

function showToast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.textContent = msg;
  document.getElementById('toastContainer').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function trunc(s, n = 80) {
  if (!s) return '—';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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
    if (currentTripId) await loadStudies();
  } catch {
    showToast('Failed to load trips', 'error');
  }
}

async function loadStudies() {
  if (!currentTripId) {
    allStudies = [];
    renderTable();
    return;
  }
  try {
    const res = await fetch(`/api/trip-planning/destination-studies?trip_id=${currentTripId}`);
    const data = await res.json();
    allStudies = data.studies || [];
    renderTable();
  } catch {
    showToast('Failed to load studies', 'error');
  }
}

function renderTable() {
  const tbody = document.getElementById('studiesBody');
  if (!allStudies.length) {
    const msg = currentTripId ? 'No destination studies yet. Click + Add Study to begin research.' : 'Select a trip to view destination studies.';
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><p>${msg}</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = allStudies.map(s => `<tr>
    <td><strong>${esc(s.country)}</strong></td>
    <td class="truncate" style="max-width:180px" title="${esc(s.location_notes)}">${esc(trunc(s.location_notes))}</td>
    <td>${esc(s.monsoon_season) || '—'}</td>
    <td class="truncate" style="max-width:180px" title="${esc(s.key_tips)}">${esc(trunc(s.key_tips))}</td>
    <td>${fmtDate(s.updated_at)}</td>
    <td class="table-actions">
      <button class="btn btn-ghost btn-sm" onclick="openEditModal('${s.study_id}')">Edit</button>
    </td>
  </tr>`).join('');
}

function onTripChange(id) {
  currentTripId = id;
  localStorage.setItem('family-trip-selected', id);
  loadStudies();
}

function openAddModal() {
  document.getElementById('studyModalTitle').textContent = 'Add Destination Study';
  document.getElementById('editId').value = '';
  document.getElementById('deleteBtn').style.display = 'none';
  document.getElementById('fCountry').value = '';
  document.getElementById('fLocationNotes').value = '';
  document.getElementById('fMonsoon').value = '';
  document.getElementById('fKeyTips').value = '';
  document.getElementById('studyModal').classList.add('open');
}

function openEditModal(id) {
  const s = allStudies.find(s => s.study_id === id);
  if (!s) return;
  document.getElementById('studyModalTitle').textContent = 'Edit Destination Study';
  document.getElementById('editId').value = id;
  document.getElementById('deleteBtn').style.display = '';
  document.getElementById('fCountry').value = s.country;
  document.getElementById('fLocationNotes').value = s.location_notes;
  document.getElementById('fMonsoon').value = s.monsoon_season;
  document.getElementById('fKeyTips').value = s.key_tips;
  document.getElementById('studyModal').classList.add('open');
}

function closeModal() { document.getElementById('studyModal').classList.remove('open'); }

async function saveStudy() {
  const country = document.getElementById('fCountry').value.trim();
  if (!country) { showToast('Country / destination is required', 'error'); return; }
  if (!currentTripId) { showToast('No trip selected', 'error'); return; }
  const payload = {
    trip_id: currentTripId,
    country,
    location_notes: document.getElementById('fLocationNotes').value,
    monsoon_season: document.getElementById('fMonsoon').value,
    key_tips: document.getElementById('fKeyTips').value
  };
  const id = document.getElementById('editId').value;
  try {
    const url = id ? `/api/trip-planning/destination-studies/${id}` : '/api/trip-planning/destination-studies';
    const res = await fetch(url, { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error();
    closeModal();
    showToast(id ? 'Study updated' : 'Study added', 'success');
    await loadStudies();
  } catch {
    showToast('Save failed', 'error');
  }
}

async function deleteStudy() {
  const id = document.getElementById('editId').value;
  if (!id || !confirm('Delete this destination study?')) return;
  try {
    await fetch(`/api/trip-planning/destination-studies/${id}`, { method: 'DELETE' });
    closeModal();
    showToast('Study deleted');
    await loadStudies();
  } catch {
    showToast('Delete failed', 'error');
  }
}

loadTrips();
