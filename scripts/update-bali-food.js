// WARNING: One-off data migration script — modifies/clears trip data.
// Run only with full understanding of consequences. Not for production use.

const { readStore, saveStore } = require('./tripStore');

const store = readStore();
const tripId = '7449598b-2042-4936-942c-fc566204ce60';

store.discussionEntries.push({
  discussion_id: "disc-food-1",
  trip_id: tripId,
  created_at: new Date().toISOString(),
  author: "Kevin",
  proposal: "Family-Friendly Food Shortlist (< USD 15 / pax)",
  decision: "Proposed",
  notes: "Ubud: Milk & Madu, Warung Bintangbali, Sun Sun Warung, Clear Cafe, Taco Casa, Watercress Cafe (Special). Nusa Dua: Bumbu Bali, Warung Dobiel, Nyoman's Beer Garden, Kendi Kuning, Bali Collection, Jimbaran Bay Seafood (Special). All options focus on mild/medium spice and high value."
});

saveStore(store);
console.log("Food shortlist added to app!");
