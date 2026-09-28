// Randomized differential test. For a generated word SET (tiny alphabets to
// force dense shared prefixes, with duplicate inserts), every sampled order
// must agree with a Set-membership oracle on a broad probe set, and produce a
// byte-identical encoded trie.
var assert = require("assert"),
    h = require("./_harness.js");

var bits = h.loadBits();

function probeWords(members, maxLen) {
    var letters = {};
    members.join("").split("").forEach(function (c) { letters[c] = true; });
    var list = Object.keys(letters).sort();
    var out = {};
    (function gen(prefix, depth) {
        if (prefix) { out[prefix] = true; }
        if (depth === maxLen) { return; }
        for (var i = 0; i < list.length; i++) { gen(prefix + list[i], depth + 1); }
    })("", 0);
    return Object.keys(out);
}

function runSet(words) {
    var member = {};
    words.forEach(function (w) { member[w] = true; });
    var maxLen = Math.min(words.reduce(function (m, w) { return Math.max(m, w.length); }, 0), 4);
    var probes = probeWords(Object.keys(member), maxLen);

    var orders = words.length <= 6
        ? h.permutations(words, 120)
        : [words.slice().sort(), words.slice().sort().reverse()];
    if (orders.length < 2) {
        var rand = h.rng(words.length * 131 + 7);
        for (var i = 0; i < 25; i++) { orders.push(h.shuffle(rand, words)); }
    }

    var sig = null;
    orders.forEach(function (order) {
        var b = h.build(bits, order);
        probes.forEach(function (p) {
            assert.strictEqual(b.frozen.lookup(p), !!member[p],
                "probe " + JSON.stringify(p) + " expected " + !!member[p] +
                " order " + JSON.stringify(order) + " set " + JSON.stringify(words));
        });
        var s = b.nodeCount + "|" + b.trie + "|" + b.dir;
        if (sig === null) { sig = s; }
        else { assert.strictEqual(s, sig, "structure order-dependent for " + JSON.stringify(words)); }
    });
}

for (var f = 0; f < 200; f++) {
    var rand = h.rng(0x9e3779b9 ^ (f * 2654435761));
    var alpha = (f % 2 === 0) ? "ab" : "abc";
    var n = 2 + Math.floor(rand() * 6);
    var words = [], seen = {};
    while (words.length < n) {
        var len = 1 + Math.floor(rand() * 5);
        var w = "";
        for (var k = 0; k < len; k++) { w += alpha[Math.floor(rand() * alpha.length)]; }
        if (!(w in seen)) {
            seen[w] = true;
            words.push(w);
            if (rand() < 0.4) {
                words.push(words[Math.floor(rand() * (words.length - 1))]);
            }
        }
    }
    runSet(words);
}

console.log("regression-fuzz: OK (200 randomized sets)");
