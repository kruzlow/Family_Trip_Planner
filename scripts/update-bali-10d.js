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
  name: "Bali Family Adventure: 10D9N (Oct 2026)",
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
  research_notes: "Recommended travel windows: Sep-Oct (best overall), Apr-May (best value), Jun (good balance). Travelers: 2 Adults + 2 Children. Base: Ubud (4 nights) + Nusa Dua (5 nights).",
  monsoon_tips: "Avoid Dec-Feb, Jul-Aug + late Dec/early Jan."
});

const items = [
  { day: 1, name: "Arrive -> Ubud", notes: "Transfer DPS->Ubud (1.5-2h). Check into hotel, relax after flight, light dinner in Ubud town." },
  { day: 2, name: "Ubud Culture & Monkeys", notes: "Morning: Sacred Monkey Forest. Afternoon: Ubud Palace and Ubud Art Market. Evening: Dinner in town." },
  { day: 3, name: "Ubud Nature & Cooking", notes: "Morning: Tegalalang Rice Terraces. Afternoon/Evening: Family Balinese cooking class." },
  { day: 4, name: "Ubud Kid-Friendly Adventures", notes: "Morning: Campuhan Ridge Walk (go early!). Afternoon: Bali Bird Park or Bali Zoo. Rainy alt: Neka Art Museum / indoor activities." },
  { day: 5, name: "Ubud -> Nusa Dua", notes: "Morning: Leisurely breakfast. Late morning: Transfer to Nusa Dua (1.5-2h). Afternoon: Check into resort, beach time." },
  { day: 6, name: "Nusa Dua Beach & Water Wonders", notes: "Morning: Gentle water sports (banana boats) & Water Blow (supervise kids!). Afternoon: Resort pool time." },
  { day: 7, name: "Nusa Dua - Southern Exploration", notes: "Day trip to Uluwatu Temple & Padang Padang beach. Enjoy the sunset and Kecak dance (if kids are up for it)." },
  { day: 8, name: "Nusa Dua - Resort Relaxation", notes: "Full day of relaxing at the resort, kids club, pool day, and building sandcastles. Rainy alt: Devdan Show." },
  { day: 9, name: "Nusa Dua - Leisure & Farewell", notes: "Optional half-day trip to Sanur or just enjoy the calm beaches. Evening: Special farewell family dinner." },
  { day: 10, name: "Depart", notes: "Leisurely breakfast, last beach stroll. Transfer to DPS Airport (30-45 mins from Nusa Dua)." }
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
  proposal: "Expanded to 10D9N in Oct 2026. Base: Ubud (4 nights) + Nusa Dua (5 nights).",
  decision: "Pending",
  notes: "Awaiting Gui Rong's confirmation on exact travel dates in October 2026."
});

saveStore(store);
console.log("Updated to 10D9N!");
