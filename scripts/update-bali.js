// WARNING: One-off data migration script — modifies/clears trip data.
// Run only with full understanding of consequences. Not for production use.

const { readStore, saveStore } = require('./tripStore');

const store = readStore();

// Clear old
store.trips = [];
store.destinationStudies = [];
store.itineraryItems = [];
store.itineraryLegs = [];
store.discussionEntries = [];

const tripId = '7449598b-2042-4936-942c-fc566204ce60';
const destId = 'dest-bali';

store.trips.push({
  trip_id: tripId,
  name: "Bali Family Adventure: 6D5N (Sep–Oct)",
  start_date: "",
  end_date: "",
  primary_destination_id: destId,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
});

store.destinationStudies.push({
  destination_study_id: destId,
  trip_id: tripId,
  name: "Bali, Indonesia",
  research_notes: "Recommended travel windows: Sep-Oct (best overall), Apr-May (best value), Jun (good balance). Travelers: 2 Adults + 2 Children. Base: Ubud (3 nights) + Nusa Dua (3 nights).",
  monsoon_tips: "Avoid Dec-Feb, Jul-Aug + late Dec/early Jan."
});

const items = [
  { day: 1, name: "Arrive -> Ubud", notes: "transfer DPS->Ubud (1.5-2h); Ubud town center + Ubud Palace; dinner. Rainy alt: Neka Art Museum / Balinese dance." },
  { day: 2, name: "Ubud", notes: "Sacred Monkey Forest; Tegalalang Rice Terraces; evening Balinese cooking class. Rainy alt: Bird Park/Zoo; indoor cooking." },
  { day: 3, name: "Ubud -> Nusa Dua", notes: "Campuhan Ridge Walk; Ubud Art Market; transfer to Nusa Dua (1.5-2h); beach + dinner. Rainy alt: Bali Collection." },
  { day: 4, name: "Nusa Dua", notes: "calm beach + gentle water sports; Water Blow; resort pool; dinner. Rainy alt: Devdan Show / resort activities." },
  { day: 5, name: "Nusa Dua", notes: "Option 1 Uluwatu Temple + Padang Padang beach OR Option 2 relaxed resort/beach/playground; farewell dinner." },
  { day: 6, name: "Depart", notes: "breakfast; transfer Nusa Dua->DPS (30-45m)." }
];

items.forEach((item, idx) => {
  store.itineraryItems.push({
    itinerary_item_id: 'item-' + (idx + 1),
    trip_id: tripId,
    sequence: idx + 1,
    day: item.day,
    location_name: item.name,
    start_time: "",
    end_time: "",
    notes: item.notes
  });
});

store.discussionEntries.push({
  discussion_id: "disc-1",
  trip_id: tripId,
  created_at: new Date().toISOString(),
  author: "Kevin",
  proposal: "Base: Ubud (3 nights) + Nusa Dua (3 nights). Should we lock in exact travel dates within Sep-Oct (or Apr-May)?",
  decision: "Pending",
  notes: "Awaiting Gui Rong's confirmation on exact travel dates."
});

saveStore(store);
console.log("Updated!");
