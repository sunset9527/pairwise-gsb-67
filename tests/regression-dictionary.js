// End-to-end regression against the shipped dictionary: a large sorted word
// list, and the same words in reverse and random order, must build a trie in
// which every dictionary word is found and non-members are rejected.
var assert = require("assert"),
    fs = require("fs"),
    path = require("path"),
    h = require("./_harness.js");

var bits = h.loadBits();

var raw = fs.readFileSync(path.resolve(__dirname, "..", "dict", "string.txt"), "utf8");
var words = raw.replace(/\n/g, "").split(" ").filter(Boolean);

function buildAndCheck(order, label) {
    var b = h.build(bits, order);
    for (var i = 0; i < words.length; i++) {
        if (!b.frozen.lookup(words[i])) {
            throw new assert.AssertionError({
                message: "missing word " + JSON.stringify(words[i]) + " in " + label + " build"
            });
        }
    }
    // Non-members: extension and a character outside the a-z set.
    ["zzzz", "qqqqq", "aals" + "zzz"].forEach(function (w) {
        assert.strictEqual(b.frozen.lookup(w), false, w + " ghost-positive in " + label);
    });
    return b;
}

var sorted = buildAndCheck(words.slice().sort(), "sorted");
buildAndCheck(words.slice().sort().reverse(), "reverse");

var rand = h.rng(0xdeadbeef);
buildAndCheck(h.shuffle(rand, words), "random");

// The structure must be identical across all three orderings.
var rand2 = h.rng(0xdeadbeef);
var shuffled = h.shuffle(rand2, words);
var reversed = h.build(bits, words.slice().sort().reverse());
var shufBuild = h.build(bits, shuffled);
assert.strictEqual(reversed.nodeCount, sorted.nodeCount, "reverse node count differs");
assert.strictEqual(shufBuild.nodeCount, sorted.nodeCount, "random node count differs");
assert.strictEqual(reversed.trie, sorted.trie, "reverse encoded trie differs");
assert.strictEqual(shufBuild.trie, sorted.trie, "random encoded trie differs");
assert.strictEqual(reversed.dir, sorted.dir, "reverse rank directory differs");

console.log("regression-dictionary: OK (" + words.length + " words, 3 orderings)");
