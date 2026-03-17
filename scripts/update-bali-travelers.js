// WARNING: One-off data migration script — modifies/clears trip data.
// Run only with full understanding of consequences. Not for production use.

const { readStore, saveStore } = require('./tripStore');

const store = readStore();
const tripId = '7449598b-2042-4936-942c-fc566204ce60';
const destId = 'dest-bali';

const dest = store.destinationStudies.find(d => d.destination_study_id === destId);
if (dest) {
  dest.research_notes = "Recommended travel windows: Sep-Oct (best overall), Apr-May (best value), Jun (good balance). Travelers: 2 Adults + 3 Children (14F, 12M, 4M). Base: Ubud (4 nights) + Nusa Dua (5 nights).";
}

store.discussionEntries.push({
  discussion_id: "disc-3",
  trip_id: tripId,
  created_at: new Date().toISOString(),
  author: "Kevin",
  proposal: "Flight Scouting: SIN <-> DPS (Direct) for Oct 3-12, 2026",
  decision: "Proposed",
  notes: "5 Pax (2A, 3C). Target budget: Best value (total trip budget ~SGD 8000). Looking at Scoot/Jetstar/AirAsia vs SQ/KLM."
});

saveStore(store);
console.log("Updated traveler count and added flight discussion!");
