// Regression: inserting out of order must not create a duplicate "shadow"
// child branch. Previously insert() reused a path cached from the previously
// inserted word; when the new word shared a prefix with an earlier,
// non-adjacent word, the cache was truncated mid-way and a second child with
// the same letter was pushed. lookup() descended into the first (dead) shadow
// and silently returned false for an inserted word.
var assert = require("assert"),
    h = require("./_harness.js");

var bits = h.loadBits();

// Minimal repro of the shadow branch.
var trie = h.build(bits, ["abc", "bc", "axx"]).frozen;
assert.strictEqual(trie.lookup("abc"), true, "abc must be found");
assert.strictEqual(trie.lookup("bc"), true, "bc must be found");
assert.strictEqual(trie.lookup("axx"), true, "axx must not be shadowed");

// A word branching off after an unrelated intervening word.
var trie2 = h.build(bits, ["abcd", "xy", "abce"]).frozen;
assert.strictEqual(trie2.lookup("abcd"), true);
assert.strictEqual(trie2.lookup("abce"), true);
assert.strictEqual(trie2.lookup("xy"), true);

// The same set must contain exactly the same nodes regardless of order; the
// buggy version allocated one extra phantom node for the bad ordering.
var good = h.build(bits, ["abc", "axx", "bc"]);
var bad = h.build(bits, ["abc", "bc", "axx"]);
assert.strictEqual(bad.nodeCount, good.nodeCount,
    "node count must be order independent (no shadow nodes)");
assert.strictEqual(bad.trie, good.trie, "encoded trie must be order independent");

console.log("regression-shadow-branch: OK");
