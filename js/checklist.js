let currentTripId = localStorage.getItem('family-trip-selected') || '';
let allTasks = [];
let filteredTasks = [];

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

function fmtDate(d) { return d ? d.slice(0, 10) : '—'; }

const STATUS_CYCLE = { todo: 'doing', doing: 'done', done: 'todo' };
const STATUS_BADGE = { todo: 'badge-blue', doing: 'badge-amber', done: 'badge-green' };
const STATUS_LABEL = { todo: 'To Do', doing: 'Doing', done: 'Done' };
const PRIORITY_BADGE = { high: 'badge-red', medium: 'badge-amber', low: 'badge-slate' };
const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };

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
      showAIButton(true);
      await loadTasks();
    }
  } catch {
    showToast('Failed to load trips', 'error');
  }
}

function showAIButton(show) {
  document.getElementById('genChecklistBtn').style.display = show ? '' : 'none';
  document.getElementById('genStatus').style.display = show ? '' : 'none';
}

async function loadTasks() {
  if (!currentTripId) {
    allTasks = [];
    filteredTasks = [];
    renderStats();
    renderTable();
    return;
  }
  try {
    const res = await fetch(`/api/trip-planning/tasks?trip_id=${currentTripId}`);
    const data = await res.json();
    allTasks = data.tasks || [];
    applyFilters();
  } catch {
    showToast('Failed to load tasks', 'error');
  }
}

function applyFilters() {
  const search = (document.getElementById('searchInput').value || '').toLowerCase();
  const statusF = document.getElementById('statusFilter').value;
  const priorityF = document.getElementById('priorityFilter').value;
  filteredTasks = allTasks.filter(t => {
    if (search && !t.title.toLowerCase().includes(search)) return false;
    if (statusF && t.status !== statusF) return false;
    if (priorityF && t.priority !== priorityF) return false;
    return true;
  });
  renderStats();
  renderTable();
}

function renderStats() {
  document.getElementById('statTotal').textContent = allTasks.length;
  document.getElementById('statDoing').textContent = allTasks.filter(t => t.status === 'doing').length;
  document.getElementById('statDone').textContent = allTasks.filter(t => t.status === 'done').length;
}

function renderTable() {
  const tbody = document.getElementById('tasksBody');
  if (!filteredTasks.length) {
    const msg = currentTripId ? 'No tasks match your filters.' : 'Select a trip to view its checklist.';
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><p>${msg}</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = filteredTasks.map(t => `<tr>
    <td>${esc(t.title)}</td>
    <td>${esc(t.assignee) || '—'}</td>
    <td>${fmtDate(t.due_date)}</td>
    <td><span class="badge ${PRIORITY_BADGE[t.priority] || 'badge-slate'}">${PRIORITY_LABEL[t.priority] || t.priority}</span></td>
    <td><span class="badge badge-status ${STATUS_BADGE[t.status] || 'badge-slate'}" onclick="cycleStatus('${t.task_id}','${t.status}')" title="Click to advance status">${STATUS_LABEL[t.status] || t.status}</span></td>
    <td class="table-actions">
      <button class="btn btn-ghost btn-sm" onclick="openEditModal('${t.task_id}')">Edit</button>
    </td>
  </tr>`).join('');
}

async function cycleStatus(id, current) {
  const next = STATUS_CYCLE[current] || 'todo';
  try {
    const res = await fetch(`/api/trip-planning/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next })
    });
    if (!res.ok) throw new Error();
    const idx = allTasks.findIndex(t => t.task_id === id);
    if (idx !== -1) allTasks[idx].status = next;
    applyFilters();
  } catch {
    showToast('Status update failed', 'error');
  }
}

function onTripChange(id) {
  currentTripId = id;
  localStorage.setItem('family-trip-selected', id);
  showAIButton(!!id);
  loadTasks();
}

// ── AI Checklist Generation ───────────────────────────────────────────────────

async function generateChecklist() {
  if (!currentTripId) { showToast('No trip selected', 'error'); return; }
  const btn = document.getElementById('genChecklistBtn');
  const status = document.getElementById('genStatus');
  btn.disabled = true;
  status.textContent = 'Generating checklist…';
  try {
    const res = await fetch('/api/trip-planning/ai/checklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trip_id: currentTripId })
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    const data = await res.json();
    status.textContent = `${data.count || 0} tasks generated`;
    showToast(`${data.count || 0} checklist items created`, 'success');
    await loadTasks();
  } catch (e) {
    showToast('Failed to generate checklist: ' + e.message, 'error');
    status.textContent = '';
  } finally {
    btn.disabled = false;
  }
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function openAddModal() {
  document.getElementById('taskModalTitle').textContent = 'Add Task';
  document.getElementById('editId').value = '';
  document.getElementById('deleteBtn').style.display = 'none';
  document.getElementById('fTitle').value = '';
  document.getElementById('fAssignee').value = '';
  document.getElementById('fDue').value = '';
  document.getElementById('fPriority').value = 'medium';
  document.getElementById('fStatus').value = 'todo';
  document.getElementById('fNotes').value = '';
  document.getElementById('taskModal').classList.add('open');
}

function openEditModal(id) {
  const task = allTasks.find(t => t.task_id === id);
  if (!task) return;
  document.getElementById('taskModalTitle').textContent = 'Edit Task';
  document.getElementById('editId').value = id;
  document.getElementById('deleteBtn').style.display = '';
  document.getElementById('fTitle').value = task.title;
  document.getElementById('fAssignee').value = task.assignee || '';
  document.getElementById('fDue').value = task.due_date || '';
  document.getElementById('fPriority').value = task.priority;
  document.getElementById('fStatus').value = task.status;
  document.getElementById('fNotes').value = task.notes;
  document.getElementById('taskModal').classList.add('open');
}

function closeModal() { document.getElementById('taskModal').classList.remove('open'); }

async function saveTask() {
  const title = document.getElementById('fTitle').value.trim();
  if (!title) { showToast('Title is required', 'error'); return; }
  if (!currentTripId) { showToast('No trip selected', 'error'); return; }
  const payload = {
    trip_id: currentTripId,
    title,
    assignee: document.getElementById('fAssignee').value.trim() || null,
    due_date: document.getElementById('fDue').value || null,
    priority: document.getElementById('fPriority').value,
    status: document.getElementById('fStatus').value,
    notes: document.getElementById('fNotes').value
  };
  const id = document.getElementById('editId').value;
  try {
    const url = id ? `/api/trip-planning/tasks/${id}` : '/api/trip-planning/tasks';
    const res = await fetch(url, { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error();
    closeModal();
    showToast(id ? 'Task updated' : 'Task added', 'success');
    await loadTasks();
  } catch {
    showToast('Save failed', 'error');
  }
}

async function deleteTask() {
  const id = document.getElementById('editId').value;
  if (!id || !confirm('Delete this task?')) return;
  try {
    await fetch(`/api/trip-planning/tasks/${id}`, { method: 'DELETE' });
    closeModal();
    showToast('Task deleted');
    await loadTasks();
  } catch {
    showToast('Delete failed', 'error');
  }
}

loadTrips();
