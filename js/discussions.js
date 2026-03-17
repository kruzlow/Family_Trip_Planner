let currentTripId = localStorage.getItem('family-trip-selected') || '';
let allDiscussions = [];

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

function fmtDateTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
    if (currentTripId) await loadDiscussions();
  } catch {
    showToast('Failed to load trips', 'error');
  }
}

async function loadDiscussions() {
  if (!currentTripId) {
    allDiscussions = [];
    renderCards();
    return;
  }
  try {
    const res = await fetch(`/api/trip-planning/discussions?trip_id=${currentTripId}`);
    const data = await res.json();
    allDiscussions = data.discussions || [];
    renderCards();
  } catch {
    showToast('Failed to load discussions', 'error');
  }
}

function renderCards() {
  const container = document.getElementById('discussionsContainer');
  if (!allDiscussions.length) {
    const msg = currentTripId
      ? 'No discussion entries yet. Click + Add Entry to start the conversation.'
      : 'Select a trip to view the discussion log.';
    container.innerHTML = `<div class="empty-state"><p>${msg}</p></div>`;
    return;
  }
  container.innerHTML = allDiscussions.map(d => {
    const hasDecision = !!d.decision;
    const badge = hasDecision
      ? '<span class="badge badge-green">Decided</span>'
      : '<span class="badge badge-slate">Open</span>';
    const decisionHtml = hasDecision
      ? `<div class="discussion-decision">Decision: ${esc(d.decision)}</div>` : '';
    const notesHtml = d.notes
      ? `<div class="discussion-notes text-muted text-sm">Notes: ${esc(d.notes)}</div>` : '';
    return `<div class="discussion-card">
      <div class="discussion-card-header">
        ${d.author ? `<span class="discussion-author">${esc(d.author)}</span>` : ''}
        <span class="discussion-date">${fmtDateTime(d.created_at)}</span>
        ${badge}
      </div>
      <div class="discussion-proposal">${esc(d.proposal)}</div>
      ${decisionHtml}
      ${notesHtml}
      <div class="discussion-actions">
        <button class="btn btn-ghost btn-sm" onclick="deleteEntry('${d.discussion_id}')">Delete</button>
      </div>
    </div>`;
  }).join('');
}

function onTripChange(id) {
  currentTripId = id;
  localStorage.setItem('family-trip-selected', id);
  loadDiscussions();
}

function openAddModal() {
  document.getElementById('fAuthor').value = '';
  document.getElementById('fProposal').value = '';
  document.getElementById('fDecision').value = '';
  document.getElementById('fNotes').value = '';
  document.getElementById('entryModal').classList.add('open');
}

function closeModal() { document.getElementById('entryModal').classList.remove('open'); }

async function saveEntry() {
  const proposal = document.getElementById('fProposal').value.trim();
  if (!proposal) { showToast('Proposal is required', 'error'); return; }
  if (!currentTripId) { showToast('No trip selected', 'error'); return; }
  const payload = {
    trip_id: currentTripId,
    author: document.getElementById('fAuthor').value.trim(),
    proposal,
    decision: document.getElementById('fDecision').value.trim(),
    notes: document.getElementById('fNotes').value.trim()
  };
  try {
    const res = await fetch('/api/trip-planning/discussions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error();
    closeModal();
    showToast('Entry added', 'success');
    await loadDiscussions();
  } catch {
    showToast('Save failed', 'error');
  }
}

async function deleteEntry(id) {
  if (!confirm('Delete this discussion entry?')) return;
  try {
    await fetch(`/api/trip-planning/discussions/${id}`, { method: 'DELETE' });
    showToast('Entry deleted');
    await loadDiscussions();
  } catch {
    showToast('Delete failed', 'error');
  }
}

loadTrips();
