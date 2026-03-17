let currentTripId = localStorage.getItem('family-trip-selected') || '';
let currentTrip = null;
let hotelZones = []; // [{stay_zone, hotels:[...]}]
let selectedHotels = {}; // {zone_index: {hotel_name, stay_zone}}

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
      await loadData();
    } else showNoBanner();
  } catch {
    showToast('Failed to load trips', 'error');
  }
}

function showNoBanner() {
  document.getElementById('noTripBanner').style.display = '';
  document.getElementById('hotelPanel').style.display = 'none';
  document.getElementById('itineraryPanel').style.display = 'none';
  document.getElementById('statDays').textContent = '—';
  document.getElementById('statAttractions').textContent = '—';
  document.getElementById('statActivities').textContent = '—';
}

async function loadData() {
  if (!currentTripId) { showNoBanner(); return; }
  document.getElementById('noTripBanner').style.display = 'none';
  document.getElementById('hotelPanel').style.display = '';
  document.getElementById('itineraryPanel').style.display = '';

  // Attractions count from trip object
  const attractionCount = currentTrip && Array.isArray(currentTrip.attractions)
    ? currentTrip.attractions.filter(a => a.selected !== false).length
    : 0;
  document.getElementById('statAttractions').textContent = attractionCount || '0';

  try {
    const dr = await fetch(`/api/trip-planning/discussions?trip_id=${currentTripId}`);
    const dd = await dr.json();

    // Load saved AI itinerary from discussion entries (author: "AI Planner")
    const aiEntries = (dd.discussions || [])
      .filter(d => d.author === 'AI Planner')
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    if (aiEntries.length) {
      const savedItinerary = parseAiDiscussionEntries(aiEntries);
      if (savedItinerary.length) {
        renderItineraryPreview(savedItinerary);
        document.getElementById('itineraryStatus').textContent = `${savedItinerary.length} days loaded from saved itinerary`;
        document.getElementById('genItineraryBtn').disabled = false;
        document.getElementById('statDays').textContent = savedItinerary.length;
        const totalActivities = savedItinerary.reduce((sum, day) => sum + (day.activities ? day.activities.length : 0), 0);
        document.getElementById('statActivities').textContent = totalActivities;
        return;
      }
    }
    document.getElementById('statDays').textContent = '0';
    document.getElementById('statActivities').textContent = '0';
    document.getElementById('itineraryPreview').innerHTML = '';
  } catch {
    showToast('Failed to load itinerary', 'error');
  }
}

function parseAiDiscussionEntries(entries) {
  // Parse discussion entries back into itinerary day objects for display
  const dayMap = {};
  entries.forEach(entry => {
    const proposal = entry.proposal || '';
    // Parse "Day N (date) — Hotel: X\n\nactivities"
    const headerMatch = proposal.match(/^Day (\d+)(?:\s+\(([^)]+)\))?\s+[—-]+\s+Hotel:\s*(.*)/m);
    if (!headerMatch) return;
    const dayNum = parseInt(headerMatch[1], 10);
    const date = headerMatch[2] || '';
    const hotel = (headerMatch[3] || '').trim();
    // Parse activity lines: "HH:MM activity @ location (Nmin)"
    const lines = proposal.split('\n').slice(2);
    const activities = [];
    lines.forEach(line => {
      const l = line.trim();
      if (!l) return;
      const timeMatch = l.match(/^(\d{1,2}:\d{2})\s+(.*)/);
      if (timeMatch) {
        const rest = timeMatch[2];
        const locMatch = rest.match(/^(.*?)\s+@\s+(.*?)(?:\s+\((\d+)min\))?$/);
        if (locMatch) {
          activities.push({ time: timeMatch[1], activity: locMatch[1].trim(), location: locMatch[2].trim(), duration_min: locMatch[3] ? parseInt(locMatch[3]) : null });
        } else {
          const durMatch = rest.match(/^(.*?)\s+\((\d+)min\)$/);
          if (durMatch) {
            activities.push({ time: timeMatch[1], activity: durMatch[1].trim(), location: '', duration_min: parseInt(durMatch[2]) });
          } else {
            activities.push({ time: timeMatch[1], activity: rest.trim(), location: '', duration_min: null });
          }
        }
      } else {
        activities.push({ time: '', activity: l, location: '', duration_min: null });
      }
    });
    // If multiple entries for same day, use the latest
    if (!dayMap[dayNum] || new Date(entry.created_at) > new Date(dayMap[dayNum]._created_at)) {
      dayMap[dayNum] = { day: dayNum, date, hotel, activities, _created_at: entry.created_at };
    }
  });
  return Object.values(dayMap).sort((a, b) => a.day - b.day);
}

function onTripChange(id) {
  currentTripId = id;
  localStorage.setItem('family-trip-selected', id);
  selectedHotels = {};
  hotelZones = [];
  document.getElementById('hotelZones').innerHTML = '';
  document.getElementById('itineraryPreview').innerHTML = '';
  document.getElementById('itineraryStatus').textContent = '';
  document.getElementById('genItineraryBtn').disabled = true;
  // Find trip object
  fetch('/api/trip-planning/trips').then(r => r.json()).then(data => {
    currentTrip = (data.trips || []).find(t => t.trip_id === id) || null;
    loadData();
  });
}

// ── Hotel Generation ──────────────────────────────────────────────────────────

async function generateHotels() {
  if (!currentTripId) { showToast('No trip selected', 'error'); return; }
  const btn = document.getElementById('genHotelsBtn');
  const status = document.getElementById('hotelsStatus');
  btn.disabled = true;
  status.textContent = 'Generating hotel recommendations…';
  try {
    const res = await fetch('/api/trip-planning/ai/hotels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trip_id: currentTripId })
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    const data = await res.json();
    hotelZones = data.zones || [];
    selectedHotels = {};
    renderHotelZones();
    status.textContent = `${hotelZones.length} zone(s) generated`;
    checkItineraryReady();
  } catch (e) {
    showToast('Failed to generate hotels: ' + e.message, 'error');
    status.textContent = '';
  } finally {
    btn.disabled = false;
  }
}

function renderHotelZones() {
  const el = document.getElementById('hotelZones');
  if (!hotelZones.length) {
    el.innerHTML = '<div style="font-size:13px;color:var(--color-text-muted)">No zones generated yet.</div>';
    return;
  }
  el.innerHTML = hotelZones.map((zone, zi) => `
    <div class="zone-card">
      <div class="zone-card-header">Zone ${zi + 1}: ${esc(zone.stay_zone)}</div>
      <div class="hotel-list">
        ${(zone.hotels || []).map((h, hi) => `
          <div class="hotel-item">
            <input type="radio" name="hotel_zone_${zi}" value="${hi}" onchange="selectHotel(${zi}, ${hi})">
            <div class="hotel-info">
              <div class="hotel-name">${esc(h.name)}</div>
              ${h.address ? `<div class="hotel-address">${esc(h.address)}</div>` : ''}
              ${h.proximity_note ? `<div class="hotel-proximity">${esc(h.proximity_note)}</div>` : ''}
            </div>
            ${h.recommended === false ? '<span class="badge-not-recommended">Not Recommended</span>' : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function selectHotel(zoneIdx, hotelIdx) {
  const zone = hotelZones[zoneIdx];
  if (!zone) return;
  const hotel = zone.hotels[hotelIdx];
  if (!hotel) return;
  selectedHotels[zoneIdx] = { stay_zone: zone.stay_zone, hotel_name: hotel.name };
  checkItineraryReady();
}

function checkItineraryReady() {
  const btn = document.getElementById('genItineraryBtn');
  // Enable if at least one hotel selected (or no zones to select from)
  const hasSelection = hotelZones.length === 0 || Object.keys(selectedHotels).length > 0;
  btn.disabled = !hasSelection;
}

// ── Itinerary Generation ──────────────────────────────────────────────────────

async function generateItinerary() {
  if (!currentTripId) { showToast('No trip selected', 'error'); return; }
  const btn = document.getElementById('genItineraryBtn');
  const status = document.getElementById('itineraryStatus');
  btn.disabled = true;
  status.textContent = 'Generating itinerary…';
  try {
    const selected = Object.values(selectedHotels);
    const res = await fetch('/api/trip-planning/ai/itinerary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trip_id: currentTripId, selected_hotels: selected })
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed');
    const data = await res.json();
    renderItineraryPreview(data.itinerary || []);
    document.getElementById('statDays').textContent = (data.itinerary || []).length;
    status.textContent = `${(data.itinerary || []).length} days generated & saved to Discussion Log`;
    showToast('Itinerary generated and saved to Discussion Log', 'success');
  } catch (e) {
    showToast('Failed to generate itinerary: ' + e.message, 'error');
    status.textContent = '';
  } finally {
    btn.disabled = false;
  }
}

function renderItineraryPreview(itinerary) {
  const el = document.getElementById('itineraryPreview');
  if (!itinerary.length) { el.innerHTML = ''; return; }
  el.innerHTML = itinerary.map(day => `
    <div class="ai-day-card">
      <div class="ai-day-card-header">
        Day ${day.day}${day.date ? ' &mdash; ' + esc(day.date) : ''}
        ${day.hotel ? `<span class="ai-day-hotel">@ ${esc(day.hotel)}</span>` : ''}
      </div>
      <table class="ai-activity-table">
        ${(day.activities || []).map(a => `
          <tr>
            <td>${esc(a.time || '')}</td>
            <td>
              <strong>${esc(a.activity)}</strong>
              ${a.location ? ` <span style="color:var(--color-text-muted);font-size:12px">@ ${esc(a.location)}</span>` : ''}
              ${a.meal_type ? `<span class="meal-badge">${esc(a.meal_type)}</span>` : ''}
              ${a.duration_min ? `<span style="color:var(--color-text-muted);font-size:12px;margin-left:6px">${a.duration_min}min</span>` : ''}
              ${a.travel_min ? `<span style="color:var(--color-text-muted);font-size:12px;margin-left:4px">(+${a.travel_min}min travel)</span>` : ''}
            </td>
          </tr>
        `).join('')}
      </table>
    </div>
  `).join('');
}

loadTrips();
