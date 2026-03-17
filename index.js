require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ensureStoreFile, readStore, saveStore, createTrip, normalizeTrip, normalizeTask, normalizeItineraryItem, normalizeItineraryLeg, normalizeDestinationStudy, normalizeDiscussionEntry } = require('./tripStore');
const ai = require('./ai');

// ── Startup: warn if API keys are still placeholders ─────────────────────────
const PLACEHOLDER_PATTERN = /^your-.*-here$/i;
const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
const openaiKey = process.env.OPENAI_API_KEY || '';
if (PLACEHOLDER_PATTERN.test(anthropicKey) || !anthropicKey) {
  console.warn('[WARN] ANTHROPIC_API_KEY looks like a placeholder or is missing. AI features using Anthropic will not work.');
}
if (PLACEHOLDER_PATTERN.test(openaiKey) || !openaiKey) {
  console.warn('[WARN] OPENAI_API_KEY looks like a placeholder or is missing. AI features using OpenAI will not work.');
}

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 5000;

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────────────
// Use a function-based origin check to prevent CORS_ORIGIN=* from opening all origins.
// Only the explicitly configured allowed origin is permitted; never a wildcard.
const ALLOWED_ORIGIN = (() => {
  const raw = process.env.CORS_ORIGIN || 'http://localhost:5000';
  // Reject wildcard — fall back to the safe default
  if (raw === '*') return 'http://localhost:5000';
  return raw;
})();
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. curl, server-to-server)
    if (!origin) return callback(null, false);
    if (origin === ALLOWED_ORIGIN) return callback(null, true);
    return callback(null, false);
  },
  optionsSuccessStatus: 200
}));

// ── Rate limiting: max 10 AI requests per 15 minutes per IP ──────────────────
const aiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests, please try again later.' }
});

app.use(express.json({ limit: '100kb' }));

// ── Block /data directory — must come before static middleware ────────────────
app.use('/data', (req, res) => res.status(403).json({ error: 'Forbidden' }));

// ── Static files — serve only from public-facing files, not __dirname ─────────
app.use(express.static(path.join(__dirname, 'public')));
// Serve individual known public assets at root level
const PUBLIC_FILES = ['index.html', 'itinerary.html', 'destinations.html', 'discussions.html', 'checklist.html', 'budget.html', 'elephant.svg'];
PUBLIC_FILES.forEach(f => {
  app.get('/' + f, (req, res) => res.sendFile(path.join(__dirname, f)));
});
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/styles', express.static(path.join(__dirname, 'styles')));

// ── API key auth — protects all /api/* routes ─────────────────────────────────
const API_KEY = process.env.API_KEY || '';
app.use('/api', (req, res, next) => {
  if (!API_KEY) return next(); // not configured — skip (dev mode)
  const provided = req.headers['x-api-key'] || '';
  if (provided !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

ensureStoreFile();

app.get('/api/trip-planning/model', (req, res) => {
  const store = readStore();
  res.json({
    counts: {
      trips: store.trips.length,
      destinationStudies: store.destinationStudies.length,
      itineraryItems: store.itineraryItems.length,
      itineraryLegs: store.itineraryLegs.length,
      discussionEntries: store.discussionEntries.length,
      taskItems: store.taskItems.length
    },
    model: {
      Trip: ['trip_id', 'name', 'start_date', 'end_date', 'primary_destination_id', 'travelers', 'budget', 'created_at', 'updated_at'],
      Travelers: ['adults', 'children', 'children_ages'],
      Budget: ['currency', 'total_estimated', 'categories', 'notes'],
      BudgetCategories: ['accommodations', 'travel', 'food', 'activities', 'others'],
      DestinationStudy: ['study_id', 'trip_id', 'country', 'location_notes', 'monsoon_season', 'key_tips', 'created_at', 'updated_at'],
      ItineraryItem: ['itinerary_item_id', 'trip_id', 'sequence', 'day', 'location_name', 'start_time', 'end_time', 'notes'],
      ItineraryLeg: ['leg_id', 'trip_id', 'from_stop_id', 'to_stop_id', 'transport_mode', 'duration_min', 'notes'],
      DiscussionEntry: ['discussion_id', 'trip_id', 'created_at', 'author', 'proposal', 'decision', 'notes'],
      TaskItem: ['task_id', 'trip_id', 'title', 'due_date', 'status', 'priority', 'assignee', 'notes', 'created_at', 'updated_at']
    }
  });
});

app.post('/api/trip-planning/model/seed', (req, res) => {
  const store = readStore();
  if (!store.trips.length) {
    const seeded = createTrip({ name: 'Sample Family Trip', start_date: '', end_date: '' });
    store.trips.push(seeded);
    saveStore(store);
    return res.json({ ok: true, seeded: true, trip: seeded });
  }
  return res.json({ ok: true, seeded: false, trip: store.trips[0] });
});

// ── Trips ────────────────────────────────────────────────────────────────────

app.get('/api/trip-planning/trips', (req, res) => {
  const store = readStore();
  res.json({ trips: store.trips });
});

app.post('/api/trip-planning/trips', (req, res) => {
  const store = readStore();
  const trip = normalizeTrip(req.body || {});
  if (!trip.name) trip.name = `Trip ${store.trips.length + 1}`;
  store.trips.push(trip);
  saveStore(store);
  res.json({ trip });
});

app.put('/api/trip-planning/trips/:id', (req, res) => {
  const store = readStore();
  const idx = store.trips.findIndex((t) => t.trip_id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Trip not found' });

  const current = store.trips[idx];
  const merged = normalizeTrip({ ...current, ...(req.body || {}), trip_id: current.trip_id, created_at: current.created_at });

  store.trips[idx] = merged;
  saveStore(store);
  res.json({ trip: merged });
});

app.delete('/api/trip-planning/trips/:id', (req, res) => {
  const store = readStore();
  const before = store.trips.length;
  store.trips = store.trips.filter((t) => t.trip_id !== req.params.id);
  if (store.trips.length === before) return res.status(404).json({ error: 'Trip not found' });
  saveStore(store);
  res.json({ ok: true });
});

// ── Tasks ────────────────────────────────────────────────────────────────────

app.get('/api/trip-planning/tasks', (req, res) => {
  const store = readStore();
  const tripId = req.query.trip_id;
  const tasks = tripId ? store.taskItems.filter((t) => t.trip_id === tripId) : store.taskItems;
  res.json({ tasks });
});

app.post('/api/trip-planning/tasks', (req, res) => {
  const store = readStore();
  const task = normalizeTask(req.body || {});
  if (!task.trip_id) return res.status(400).json({ error: 'trip_id is required' });
  if (!task.title) return res.status(400).json({ error: 'title is required' });
  store.taskItems.push(task);
  saveStore(store);
  res.json({ task });
});

app.put('/api/trip-planning/tasks/:id', (req, res) => {
  const store = readStore();
  const idx = store.taskItems.findIndex((t) => t.task_id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Task not found' });
  const current = store.taskItems[idx];
  const updated = normalizeTask({ ...current, ...(req.body || {}), task_id: current.task_id, created_at: current.created_at });
  store.taskItems[idx] = updated;
  saveStore(store);
  res.json({ task: updated });
});

app.delete('/api/trip-planning/tasks/:id', (req, res) => {
  const store = readStore();
  const before = store.taskItems.length;
  store.taskItems = store.taskItems.filter((t) => t.task_id !== req.params.id);
  if (store.taskItems.length === before) return res.status(404).json({ error: 'Task not found' });
  saveStore(store);
  res.json({ ok: true });
});

// ── Itinerary Items ──────────────────────────────────────────────────────────

app.get('/api/trip-planning/itinerary-items', (req, res) => {
  const store = readStore();
  const tripId = req.query.trip_id;
  const items = tripId ? store.itineraryItems.filter((i) => i.trip_id === tripId) : store.itineraryItems;
  res.json({ items: items.sort((a, b) => a.day - b.day || a.sequence - b.sequence) });
});

app.post('/api/trip-planning/itinerary-items', (req, res) => {
  const store = readStore();
  const item = normalizeItineraryItem(req.body || {});
  if (!item.trip_id) return res.status(400).json({ error: 'trip_id is required' });
  store.itineraryItems.push(item);
  saveStore(store);
  res.json({ item });
});

app.put('/api/trip-planning/itinerary-items/:id', (req, res) => {
  const store = readStore();
  const idx = store.itineraryItems.findIndex((i) => i.itinerary_item_id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Item not found' });
  const current = store.itineraryItems[idx];
  const updated = normalizeItineraryItem({ ...current, ...(req.body || {}), itinerary_item_id: current.itinerary_item_id });
  store.itineraryItems[idx] = updated;
  saveStore(store);
  res.json({ item: updated });
});

app.delete('/api/trip-planning/itinerary-items/:id', (req, res) => {
  const store = readStore();
  const before = store.itineraryItems.length;
  store.itineraryItems = store.itineraryItems.filter((i) => i.itinerary_item_id !== req.params.id);
  if (store.itineraryItems.length === before) return res.status(404).json({ error: 'Item not found' });
  saveStore(store);
  res.json({ ok: true });
});

// ── Itinerary Legs ───────────────────────────────────────────────────────────

app.get('/api/trip-planning/itinerary-legs', (req, res) => {
  const store = readStore();
  const tripId = req.query.trip_id;
  const legs = tripId ? store.itineraryLegs.filter((l) => l.trip_id === tripId) : store.itineraryLegs;
  res.json({ legs });
});

app.post('/api/trip-planning/itinerary-legs', (req, res) => {
  const store = readStore();
  const leg = normalizeItineraryLeg(req.body || {});
  if (!leg.trip_id) return res.status(400).json({ error: 'trip_id is required' });
  store.itineraryLegs.push(leg);
  saveStore(store);
  res.json({ leg });
});

app.put('/api/trip-planning/itinerary-legs/:id', (req, res) => {
  const store = readStore();
  const idx = store.itineraryLegs.findIndex((l) => l.leg_id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Leg not found' });
  const current = store.itineraryLegs[idx];
  const updated = normalizeItineraryLeg({ ...current, ...(req.body || {}), leg_id: current.leg_id });
  store.itineraryLegs[idx] = updated;
  saveStore(store);
  res.json({ leg: updated });
});

app.delete('/api/trip-planning/itinerary-legs/:id', (req, res) => {
  const store = readStore();
  const before = store.itineraryLegs.length;
  store.itineraryLegs = store.itineraryLegs.filter((l) => l.leg_id !== req.params.id);
  if (store.itineraryLegs.length === before) return res.status(404).json({ error: 'Leg not found' });
  saveStore(store);
  res.json({ ok: true });
});

// ── Destination Studies ──────────────────────────────────────────────────────

app.get('/api/trip-planning/destination-studies', (req, res) => {
  const store = readStore();
  const tripId = req.query.trip_id;
  const studies = tripId ? store.destinationStudies.filter((s) => s.trip_id === tripId) : store.destinationStudies;
  res.json({ studies });
});

app.post('/api/trip-planning/destination-studies', (req, res) => {
  const store = readStore();
  const study = normalizeDestinationStudy(req.body || {});
  if (!study.trip_id) return res.status(400).json({ error: 'trip_id is required' });
  store.destinationStudies.push(study);
  saveStore(store);
  res.json({ study });
});

app.put('/api/trip-planning/destination-studies/:id', (req, res) => {
  const store = readStore();
  const idx = store.destinationStudies.findIndex((s) => s.study_id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Study not found' });
  const current = store.destinationStudies[idx];
  const updated = normalizeDestinationStudy({ ...current, ...(req.body || {}), study_id: current.study_id, created_at: current.created_at });
  store.destinationStudies[idx] = updated;
  saveStore(store);
  res.json({ study: updated });
});

app.delete('/api/trip-planning/destination-studies/:id', (req, res) => {
  const store = readStore();
  const before = store.destinationStudies.length;
  store.destinationStudies = store.destinationStudies.filter((s) => s.study_id !== req.params.id);
  if (store.destinationStudies.length === before) return res.status(404).json({ error: 'Study not found' });
  saveStore(store);
  res.json({ ok: true });
});

// ── Discussions ──────────────────────────────────────────────────────────────

app.get('/api/trip-planning/discussions', (req, res) => {
  const store = readStore();
  const tripId = req.query.trip_id;
  const entries = tripId ? store.discussionEntries.filter((d) => d.trip_id === tripId) : store.discussionEntries;
  res.json({ discussions: entries.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) });
});

app.post('/api/trip-planning/discussions', (req, res) => {
  const store = readStore();
  const entry = normalizeDiscussionEntry(req.body || {});
  if (!entry.trip_id) return res.status(400).json({ error: 'trip_id is required' });
  if (!entry.proposal) return res.status(400).json({ error: 'proposal is required' });
  store.discussionEntries.push(entry);
  saveStore(store);
  res.json({ discussion: entry });
});

app.put('/api/trip-planning/discussions/:id', (req, res) => {
  const store = readStore();
  const idx = store.discussionEntries.findIndex((d) => d.discussion_id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Discussion not found' });
  const current = store.discussionEntries[idx];
  const updated = normalizeDiscussionEntry({ ...current, ...(req.body || {}), discussion_id: current.discussion_id, created_at: current.created_at });
  store.discussionEntries[idx] = updated;
  saveStore(store);
  res.json({ discussion: updated });
});

app.delete('/api/trip-planning/discussions/:id', (req, res) => {
  const store = readStore();
  const before = store.discussionEntries.length;
  store.discussionEntries = store.discussionEntries.filter((d) => d.discussion_id !== req.params.id);
  if (store.discussionEntries.length === before) return res.status(404).json({ error: 'Discussion not found' });
  saveStore(store);
  res.json({ ok: true });
});

// ── AI Routes ────────────────────────────────────────────────────────────────

app.post('/api/trip-planning/ai/attractions', aiRateLimiter, async (req, res) => {
  const { country } = req.body || {};
  if (!country || typeof country !== 'string' || country.length > 100) return res.status(400).json({ error: 'Invalid country value' });
  try {
    const attractions = await ai.generateAttractions(country);
    res.json({ attractions });
  } catch (e) {
    console.error('[AI Error]', e.message || e);
    if (e.code === 'AI_NOT_CONFIGURED') return res.status(503).json({ error: 'AI features not configured' });
    res.status(500).json({ error: 'AI generation failed' });
  }
});

app.post('/api/trip-planning/ai/travel-advisory', aiRateLimiter, async (req, res) => {
  const { country } = req.body || {};
  if (!country) return res.status(400).json({ error: 'country is required' });
  try {
    const advisory = await ai.generateTravelAdvisory(country);
    res.json(advisory);
  } catch (e) {
    console.error('[AI Error]', e.message || e);
    if (e.code === 'AI_NOT_CONFIGURED') return res.status(503).json({ error: 'AI features not configured' });
    res.status(500).json({ error: 'AI generation failed' });
  }
});

app.post('/api/trip-planning/ai/hotels', aiRateLimiter, async (req, res) => {
  const { trip_id } = req.body || {};
  if (!trip_id) return res.status(400).json({ error: 'trip_id is required' });
  const store = readStore();
  const trip = store.trips.find(t => t.trip_id === trip_id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  try {
    const zones = await ai.generateHotels(trip.attractions || [], trip.start_date, trip.end_date);
    res.json({ zones });
  } catch (e) {
    console.error('[AI Error]', e.message || e);
    if (e.code === 'AI_NOT_CONFIGURED') return res.status(503).json({ error: 'AI features not configured' });
    res.status(500).json({ error: 'AI generation failed' });
  }
});

app.post('/api/trip-planning/ai/itinerary', aiRateLimiter, async (req, res) => {
  const { trip_id, selected_hotels } = req.body || {};
  if (!trip_id) return res.status(400).json({ error: 'trip_id is required' });
  const store = readStore();
  const trip = store.trips.find(t => t.trip_id === trip_id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  try {
    const start = trip.start_date ? new Date(trip.start_date) : new Date();
    const end = trip.end_date ? new Date(trip.end_date) : new Date(start.getTime() + 7 * 86400000);
    const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const itinerary = await ai.generateItinerary(trip, selected_hotels || [], trip.attractions || [], days);

    // Save each day as a discussion entry
    const { normalizeDiscussionEntry } = require('./tripStore');
    for (const day of itinerary) {
      const activitiesSummary = (day.activities || []).map(a => `${a.time || ''} ${a.activity}${a.location ? ' @ ' + a.location : ''}${a.duration_min ? ' (' + a.duration_min + 'min)' : ''}`).join('\n');
      const entry = normalizeDiscussionEntry({
        trip_id,
        author: 'AI Planner',
        proposal: `Day ${day.day}${day.date ? ' (' + day.date + ')' : ''} — Hotel: ${day.hotel || 'TBD'}\n\n${activitiesSummary}`,
        decision: 'AI Generated',
        notes: ''
      });
      store.discussionEntries.push(entry);
    }
    saveStore(store);

    res.json({ itinerary });
  } catch (e) {
    console.error('[AI Error]', e.message || e);
    if (e.code === 'AI_NOT_CONFIGURED') return res.status(503).json({ error: 'AI features not configured' });
    res.status(500).json({ error: 'AI generation failed' });
  }
});

app.post('/api/trip-planning/ai/budget', aiRateLimiter, async (req, res) => {
  const { trip_id } = req.body || {};
  if (!trip_id) return res.status(400).json({ error: 'trip_id is required' });
  const store = readStore();
  const trip = store.trips.find(t => t.trip_id === trip_id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  try {
    const estimates = await ai.generateBudgetEstimate(trip);
    const bb = JSON.parse(JSON.stringify(trip.budget_breakdown || {}));
    const CATS = ['accommodations', 'travel', 'food', 'activities', 'others'];
    CATS.forEach(cat => {
      if (!bb[cat]) bb[cat] = { estimated: 0, actual: 0 };
      bb[cat].estimated = estimates[cat] || 0;
    });
    const idx = store.trips.findIndex(t => t.trip_id === trip_id);
    const { normalizeTrip } = require('./tripStore');
    store.trips[idx] = normalizeTrip({ ...trip, budget_breakdown: bb });
    saveStore(store);
    res.json({ budget_breakdown: store.trips[idx].budget_breakdown });
  } catch (e) {
    console.error('[AI Error]', e.message || e);
    if (e.code === 'AI_NOT_CONFIGURED') return res.status(503).json({ error: 'AI features not configured' });
    res.status(500).json({ error: 'AI generation failed' });
  }
});

app.post('/api/trip-planning/ai/checklist', aiRateLimiter, async (req, res) => {
  const { trip_id } = req.body || {};
  if (!trip_id) return res.status(400).json({ error: 'trip_id is required' });
  const store = readStore();
  const trip = store.trips.find(t => t.trip_id === trip_id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  try {
    const start = trip.start_date ? new Date(trip.start_date) : new Date();
    const end = trip.end_date ? new Date(trip.end_date) : new Date(start.getTime() + 7 * 86400000);
    const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const totalTravelers = ((trip.travelers && trip.travelers.adults) || 0) + ((trip.travelers && trip.travelers.children) || 0);
    const items = await ai.generateChecklist(trip.country || 'the destination', days, totalTravelers);

    const { normalizeTask } = require('./tripStore');
    const created = [];
    for (const item of items) {
      const task = normalizeTask({
        trip_id,
        title: item.category ? `[${item.category}] ${item.title}` : item.title,
        priority: item.priority || 'medium',
        status: 'todo'
      });
      store.taskItems.push(task);
      created.push(task);
    }
    saveStore(store);
    res.json({ tasks: created, count: created.length });
  } catch (e) {
    console.error('[AI Error]', e.message || e);
    if (e.code === 'AI_NOT_CONFIGURED') return res.status(503).json({ error: 'AI features not configured' });
    res.status(500).json({ error: 'AI generation failed' });
  }
});

// ── Serve root page ───────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Family Trip Planner listening at http://0.0.0.0:${port}`);
});
