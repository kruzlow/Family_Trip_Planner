// WARNING: One-off data migration script — modifies/clears trip data.
// Run only with full understanding of consequences. Not for production use.

const { readStore, saveStore } = require('./tripStore');

const store = readStore();
const tripId = '7449598b-2042-4936-942c-fc566204ce60';
const destId = 'dest-bali';

// 1. Update Trip
const trip = store.trips.find(t => t.trip_id === tripId);
if (trip) {
  trip.name = "Bali Family Adventure: 10D9N (Tentative)";
  trip.start_date = "2026-10-03";
  trip.end_date = "2026-10-12";
  trip.updated_at = new Date().toISOString();
}

// 2. Update Destination Study
const dest = store.destinationStudies.find(d => d.destination_study_id === destId);
if (dest) {
  dest.research_notes = "Travelers: 5 Pax (2 Adults + 14F, 12M, 4M). Base: Ubud (4N) + Nusa Dua (5N). Budget: SGD 8,000 total. Flights: SIN<->DPS direct only, flexible timing.";
  dest.monsoon_tips = "Oct is generally dry/shoulder season. Avoid Dec-Feb (monsoon).";
}

// 3. Clear and Re-add 10D9N Itinerary to be perfectly clean
store.itineraryItems = store.itineraryItems.filter(i => i.trip_id !== tripId);
const items = [
  { day: 1, name: "Arrive -> Ubud", notes: "Transfer DPS->Ubud (1.5-2h). Check into hotel, relax after flight, light dinner in Ubud town." },
  { day: 2, name: "Ubud Culture & Monkeys", notes: "Morning: Sacred Monkey Forest. Afternoon: Ubud Palace and Ubud Art Market. Evening: Dinner in town." },
  { day: 3, name: "Ubud Nature & Cooking", notes: "Morning: Tegalalang Rice Terraces. Afternoon/Evening: Family Balinese cooking class." },
  { day: 4, name: "Ubud Kid-Friendly Adventures", notes: "Morning: Campuhan Ridge Walk. Afternoon: Bali Bird Park or Bali Zoo. Rainy alt: Neka Art Museum." },
  { day: 5, name: "Ubud -> Nusa Dua", notes: "Late morning transfer to Nusa Dua (1.5-2h). Afternoon: Check into resort, beach time." },
  { day: 6, name: "Nusa Dua Beach & Water Wonders", notes: "Gentle water sports (banana boats) & Water Blow. Afternoon: Resort pool time." },
  { day: 7, name: "Nusa Dua - Southern Exploration", notes: "Day trip to Uluwatu Temple & Padang Padang beach. Sunset Kecak dance." },
  { day: 8, name: "Nusa Dua - Resort Relaxation", notes: "Full day of relaxing at the resort, kids club, pool day. Rainy alt: Devdan Show." },
  { day: 9, name: "Nusa Dua - Leisure", notes: "Optional half-day trip to Sanur or calm beaches. Evening: Farewell family dinner." },
  { day: 10, name: "Depart", notes: "Leisurely breakfast. Transfer to DPS Airport (30-45 mins)." }
];

items.forEach((item, idx) => {
  store.itineraryItems.push({
    itinerary_item_id: 'item-10d-' + (idx + 1),
    trip_id: tripId,
    sequence: idx + 1,
    day: item.day,
    location_name: item.name,
    start_time: "",
    end_time: "",
    notes: item.notes
  });
});

// 4. Update Discussions with Decisions (Flights, Hotels, Budget)
store.discussionEntries = store.discussionEntries.filter(d => d.trip_id !== tripId);

store.discussionEntries.push({
  discussion_id: "disc-f1",
  trip_id: tripId,
  created_at: new Date().toISOString(),
  author: "Kevin",
  proposal: "Flights & Budget Setup",
  decision: "Approved",
  notes: "Budget: SGD 8000 total. Flights: SIN <-> DPS direct only, flexible timing for best value."
});

store.discussionEntries.push({
  discussion_id: "disc-h1",
  trip_id: tripId,
  created_at: new Date().toISOString(),
  author: "Kevin",
  proposal: "Accommodation Preferences & Shortlist",
  decision: "Approved",
  notes: "Prefs: 1 suite/family room, resort with kids club/pool, breakfast included, SGD 300-500/night. Shortlist: Ubud (Westin or Maya), Nusa Dua (Westin or Grand Hyatt). Recommended Pairing: Maya Ubud + Grand Hyatt Bali (Primary Value), Westin + Westin (Backup Kids Focus)."
});

saveStore(store);
console.log("Everything updated!");
