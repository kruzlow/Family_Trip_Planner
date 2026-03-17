const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'trip_planning.json');

const defaultData = {
  trips: [],
  destinationStudies: [],
  itineraryItems: [],
  itineraryLegs: [],
  discussionEntries: [],
  taskItems: []
};

function cloneDefaultData() {
  return JSON.parse(JSON.stringify(defaultData));
}

function nowIso() {
  return new Date().toISOString();
}

function uuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

function normalizeTrip(input = {}) {
  const travelers = input.travelers || {};
  const budget = input.budget || {};
  const bb = input.budget_breakdown || {};

  function normBBCat(cat) {
    const c = cat || {};
    return {
      estimated: Number.isFinite(Number(c.estimated)) ? Number(c.estimated) : 0,
      actual: Number.isFinite(Number(c.actual)) ? Number(c.actual) : 0
    };
  }

  return {
    trip_id: input.trip_id || uuid(),
    name: input.name || '',
    country: input.country || '',
    start_date: input.start_date || '',
    end_date: input.end_date || '',
    primary_destination_id: input.primary_destination_id || null,
    travelers: {
      adults: Number.isFinite(Number(travelers.adults)) ? Number(travelers.adults) : 0,
      children: Number.isFinite(Number(travelers.children)) ? Number(travelers.children) : 0,
      children_ages: Array.isArray(travelers.children_ages)
        ? travelers.children_ages.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 0)
        : []
    },
    budget: {
      currency: budget.currency || 'SGD',
      total_budget: Number.isFinite(Number(budget.total_budget)) ? Number(budget.total_budget) : 0,
      notes: budget.notes || ''
    },
    budget_breakdown: {
      accommodations: normBBCat(bb.accommodations),
      travel: normBBCat(bb.travel),
      food: normBBCat(bb.food),
      activities: normBBCat(bb.activities),
      others: normBBCat(bb.others)
    },
    attractions: Array.isArray(input.attractions) ? input.attractions.map(a => ({
      name: String(a.name || ''),
      description: String(a.description || ''),
      ai_generated: Boolean(a.ai_generated),
      selected: a.selected !== false
    })) : [],
    periods_to_avoid: Array.isArray(input.periods_to_avoid) ? input.periods_to_avoid.map(p => ({
      period: String(p.period || ''),
      reason: String(p.reason || '')
    })) : [],
    periods_recommended: Array.isArray(input.periods_recommended) ? input.periods_recommended.map(p => ({
      period: String(p.period || ''),
      reason: String(p.reason || '')
    })) : [],
    created_at: input.created_at || nowIso(),
    updated_at: nowIso()
  };
}

function createTrip({ name = '', start_date = '', end_date = '', country = '', primary_destination_id = null } = {}) {
  return normalizeTrip({ name, start_date, end_date, country, primary_destination_id });
}

function normalizeTask(input = {}) {
  return {
    task_id: input.task_id || uuid(),
    trip_id: input.trip_id || '',
    title: input.title || '',
    due_date: input.due_date || null,
    status: ['todo', 'doing', 'done'].includes(input.status) ? input.status : 'todo',
    priority: ['low', 'medium', 'high'].includes(input.priority) ? input.priority : 'medium',
    assignee: input.assignee || null,
    notes: input.notes || '',
    created_at: input.created_at || nowIso(),
    updated_at: nowIso()
  };
}

function normalizeDestinationStudy(input = {}) {
  return {
    study_id: input.study_id || uuid(),
    trip_id: input.trip_id || '',
    country: input.country || '',
    location_notes: input.location_notes || '',
    monsoon_season: input.monsoon_season || '',
    key_tips: input.key_tips || '',
    created_at: input.created_at || nowIso(),
    updated_at: nowIso()
  };
}

function normalizeDiscussionEntry(input = {}) {
  return {
    discussion_id: input.discussion_id || uuid(),
    trip_id: input.trip_id || '',
    author: input.author || '',
    proposal: input.proposal || '',
    decision: input.decision || '',
    notes: input.notes || '',
    created_at: input.created_at || nowIso()
  };
}

function normalizeItineraryItem(input = {}) {
  return {
    itinerary_item_id: input.itinerary_item_id || uuid(),
    trip_id: input.trip_id || '',
    sequence: Number.isFinite(Number(input.sequence)) ? Number(input.sequence) : 0,
    day: Number.isFinite(Number(input.day)) ? Number(input.day) : 1,
    location_name: input.location_name || '',
    start_time: input.start_time || '',
    end_time: input.end_time || '',
    notes: input.notes || ''
  };
}

function normalizeItineraryLeg(input = {}) {
  return {
    leg_id: input.leg_id || uuid(),
    trip_id: input.trip_id || '',
    from_stop_id: input.from_stop_id || '',
    to_stop_id: input.to_stop_id || '',
    transport_mode: input.transport_mode || 'Walk',
    duration_min: Number.isFinite(Number(input.duration_min)) ? Number(input.duration_min) : 0,
    notes: input.notes || ''
  };
}

// ── In-memory cache ────────────────────────────────────────────────────────────
// The store is read from disk once at startup (ensureStoreFile → cache is populated).
// All read operations return from the in-memory cache (zero file I/O per request).
// All write operations update the cache first, then persist to disk asynchronously.
let _cache = null;

function _normalizeFromDisk(parsed) {
  return {
    trips: Array.isArray(parsed.trips) ? parsed.trips.map(normalizeTrip) : [],
    destinationStudies: Array.isArray(parsed.destinationStudies) ? parsed.destinationStudies.map(normalizeDestinationStudy) : [],
    itineraryItems: Array.isArray(parsed.itineraryItems) ? parsed.itineraryItems.map(normalizeItineraryItem) : [],
    itineraryLegs: Array.isArray(parsed.itineraryLegs) ? parsed.itineraryLegs.map(normalizeItineraryLeg) : [],
    discussionEntries: Array.isArray(parsed.discussionEntries) ? parsed.discussionEntries.map(normalizeDiscussionEntry) : [],
    taskItems: Array.isArray(parsed.taskItems) ? parsed.taskItems.map(normalizeTask) : []
  };
}

function ensureStoreFile() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    const data = cloneDefaultData();
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
    _cache = data;
    return;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const normalized = _normalizeFromDisk(parsed);
    fs.writeFileSync(dataFile, JSON.stringify(normalized, null, 2), 'utf8');
    _cache = normalized;
  } catch {
    const data = cloneDefaultData();
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
    _cache = data;
  }
}

function readStore() {
  // Return from in-memory cache — no file I/O per request.
  // ensureStoreFile() must be called at startup to populate the cache.
  if (_cache === null) {
    // Fallback: load from disk if cache is missing (e.g. module reloaded in tests)
    try {
      const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      _cache = _normalizeFromDisk(parsed);
    } catch {
      _cache = cloneDefaultData();
    }
  }
  return _cache;
}

function saveStore(data) {
  // Update in-memory cache immediately so subsequent reads see the new data.
  _cache = data;
  // Persist to disk asynchronously — does not block the request.
  const json = JSON.stringify(data, null, 2);
  const tmp  = dataFile + '.tmp';
  fs.writeFile(tmp, json, 'utf8', (writeErr) => {
    if (writeErr) { console.error('[tripStore] write error:', writeErr); return; }
    fs.rename(tmp, dataFile, (renameErr) => {
      if (renameErr) console.error('[tripStore] rename error:', renameErr);
    });
  });
}

module.exports = {
  dataFile,
  ensureStoreFile,
  readStore,
  saveStore,
  createTrip,
  normalizeTrip,
  normalizeTask,
  normalizeItineraryItem,
  normalizeDestinationStudy,
  normalizeItineraryLeg,
  normalizeDiscussionEntry,
  nowIso,
  uuid
};
