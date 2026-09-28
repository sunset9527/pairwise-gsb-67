// Regression: inserting the same word repeatedly (adjacent or separated by
// other words) must be idempotent: no duplicate nodes, word still found.
var assert = require("assert"),
    h = require("./_harness.js");

var bits = h.loadBits();

var once = h.build(bits, ["abc"]);
var adjacent = h.build(bits, ["abc", "abc"]);
var separatedDup = h.build(bits, ["abc", "x", "abc"]);
var separatedOnce = h.build(bits, ["abc", "x"]);
var prefixDup = h.build(bits, ["ab", "ab", "a", "a"]);
var prefixOnce = h.build(bits, ["ab", "a"]);

assert.strictEqual(adjacent.nodeCount, once.nodeCount, "adjacent duplicate added nodes");
assert.strictEqual(separatedDup.nodeCount, separatedOnce.nodeCount,
    "separated duplicate added nodes");
assert.strictEqual(adjacent.frozen.lookup("abc"), true);
assert.strictEqual(separatedDup.frozen.lookup("abc"), true);
assert.strictEqual(separatedDup.frozen.lookup("x"), true);
assert.strictEqual(prefixDup.frozen.lookup("a"), true);
assert.strictEqual(prefixDup.frozen.lookup("ab"), true);
assert.strictEqual(prefixDup.nodeCount, prefixOnce.nodeCount,
    "duplicate prefix words added nodes");
assert.strictEqual(prefixDup.trie, prefixOnce.trie,
    "duplicate prefix words changed encoding");

console.log("regression-duplicates: OK");
