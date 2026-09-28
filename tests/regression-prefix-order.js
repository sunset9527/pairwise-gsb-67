// Regression: prefix words and longer words must coexist no matter which is
// inserted first, and words that diverge after a shared prefix must survive an
// intervening word. The old cache algorithm dropped the prefix word and/or
// sibling continuations depending on order.
var assert = require("assert"),
    h = require("./_harness.js");

var bits = h.loadBits();

function everyOrder(words) {
    return h.permutations(words, 720).map(function (order) {
        return { order: order.slice(), built: h.build(bits, order) };
    });
}

function assertSetOrderIndependent(words) {
    var member = {};
    words.forEach(function (w) { member[w] = true; });

    var built = everyOrder(words);
    built.forEach(function (entry) {
        var b = entry.built;
        words.forEach(function (w) {
            assert.strictEqual(b.frozen.lookup(w), true,
                JSON.stringify(w) + " dropped for order " + JSON.stringify(entry.order) +
                " in set " + JSON.stringify(words));
        });
    });

    var sig = built[0].built.nodeCount + "|" + built[0].built.trie + "|" + built[0].built.dir;
    built.forEach(function (entry) {
        var b = entry.built;
        assert.strictEqual(b.nodeCount + "|" + b.trie + "|" + b.dir, sig,
            "structure differs between orders for " + JSON.stringify(words));
    });
}

// Prefix after long word and long word after prefix.
assertSetOrderIndependent(["a", "ab"]);
assertSetOrderIndependent(["ab", "abc", "abd"]);
assertSetOrderIndependent(["abcd", "ab"]);
assertSetOrderIndependent(["ab", "abcd", "abce"]);
assertSetOrderIndependent(["abc", "abd", "a", "ab"]);
assertSetOrderIndependent(["aa", "aaa", "aab", "aac"]);
assertSetOrderIndependent(["rat", "rate", "ratify", "ratified"]);
assertSetOrderIndependent(["the", "there", "their", "they", "them"]);

// Prefix must not be reported as a word when only the longer word was added,
// and vice versa.
var onlyLong = h.build(bits, ["abcd"]).frozen;
assert.strictEqual(onlyLong.lookup("ab"), false);
assert.strictEqual(onlyLong.lookup("abcd"), true);

var onlyPrefix = h.build(bits, ["ab"]).frozen;
assert.strictEqual(onlyPrefix.lookup("ab"), true);
assert.strictEqual(onlyPrefix.lookup("abcd"), false);

console.log("regression-prefix-order: OK");
