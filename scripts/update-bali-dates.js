// WARNING: One-off data migration script — modifies/clears trip data.
// Run only with full understanding of consequences. Not for production use.

const { readStore, saveStore } = require('./tripStore');

const store = readStore();

const tripId = '7449598b-2042-4936-942c-fc566204ce60';

// Find and update the trip
const trip = store.trips.find(t => t.trip_id === tripId);
if (trip) {
  trip.start_date = "2026-10-03";
  trip.end_date = "2026-10-12";
  trip.updated_at = new Date().toISOString();
}

// Add a new discussion entry for the tentative dates
store.discussionEntries.push({
  discussion_id: "disc-2",
  trip_id: tripId,
  created_at: new Date().toISOString(),
  author: "Kevin",
  proposal: "Tentative Dates: Oct 3 - 12, 2026",
  decision: "Tentatively Approved",
  notes: "Gui Rong provided these as placeholder/tentative dates for the 10D9N trip. They can be changed later as needed."
});

saveStore(store);
console.log("Dates updated to Oct 3-12 (Tentative)!");
