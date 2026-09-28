// Differential audit: for one word SET, every insertion order must produce a
// trie where lookup(w) === true for all members (no silent drops), and results
// for a fixed probe set must be identical across orders (order invariance).
var assert = require("assert"),
    h = require("./_harness.js");

var ctx = h.loadBits();

// Systematically designed sets targeting:
//  - prefix word vs longer word, both directions
//  - words sharing prefixes then diverging
//  - common-prefix cache reuse after unrelated words
//  - duplicate words
//  - reverse / random orders
var SYSTEMATIC = [
    ["a", "ab"],
    ["ab", "a"],
    ["ab", "abc"],
    ["abc", "ab"],
    ["ab", "abc", "abd"],
    ["abd", "abc", "ab"],
    ["abc", "abd", "ab"],
    ["abc", "bc", "axx"],          // shadow branch repro
    ["axx", "abc", "bc"],
    ["abc", "axx", "bc"],
    ["abcd", "ab"],
    ["ab", "abcd", "abce"],
    ["ab", "ac", "ad"],
    ["ad", "ac", "ab"],
    ["abc", "abd", "a", "ab"],
    ["abc", "abc"],                 // duplicate, adjacent
    ["abc", "x", "abc"],            // duplicate, separated
    ["ab", "ab", "a", "a"],
    ["a", "b", "ab"],
    ["ab", "ba", "a", "b"],
    ["abc", "abd", "abe", "abf"],
    ["abc", "def", "ab", "abcd"],
    ["aaa", "aab", "aac", "aa"],
    ["aa", "aaa", "aab"],
    ["rat", "rate", "ratify", "ratified"],
    ["ratified", "ratify", "rate", "rat"],
    ["rom", "rome", "romanesque"],
    ["romanesque", "rome", "rom"],
    ["the", "there", "their", "they", "them"],
    ["them", "they", "their", "there", "the"],
    ["cat", "cats", "catalog", "catalogs", "cattle"]
];

// Probes include all members plus non-members (prefixes, extensions, siblings).
function probesFor(words) {
    var set = {};
    words.forEach(function (w) { set[w] = true; });
    var probes = Object.keys(set);
    words.forEach(function (w) {
        for (var i = 1; i < w.length; i++) {
            var pre = w.slice(0, i);
            if (!(pre in set)) { probes.push(pre); }
        }
        var ext = w + "z";
        if (!(ext in set)) { probes.push(ext); }
        if (w.length > 1) {
            var flip = w.slice(0, -1) + (w[w.length - 1] === "a" ? "b" : "a");
            if (!(flip in set)) { probes.push(flip); }
        }
    });
    return probes;
}

var failures = [];
var ordersTested = 0;

function auditSet(label, words) {
    var probes = probesFor(words);
    var memberSet = {};
    words.forEach(function (w) { memberSet[w] = true; });

    // Enumerate permutations for small sets; for larger ones sample orders.
    var orders;
    var dedup = words.length;
    if (dedup <= 6) {
        orders = h.permutations(words, 720);
    } else {
        orders = [words.slice().sort(), words.slice().sort().reverse()];
        for (var s = 1; s <= 30; s++) {
            orders.push(h.shuffle(h.rng(s * 7919 + dedup), words));
        }
    }

    var reference = null;
    var refOrder = null;

    orders.forEach(function (order) {
        ordersTested++;
        var built = h.build(ctx, order);
        var row = {};
        probes.forEach(function (p) { row[p] = built.frozen.lookup(p); });

        // Invariant 1: every member must be found.
        Object.keys(memberSet).forEach(function (m) {
            if (row[m] !== true) {
                failures.push({
                    label: label,
                    order: order.slice(),
                    kind: "DROP",
                    word: m,
                    got: row[m]
                });
            }
        });

        // Invariant 2: no false positives on non-member probes.
        probes.forEach(function (p) {
            if (!(p in memberSet) && row[p] === true) {
                failures.push({
                    label: label,
                    order: order.slice(),
                    kind: "GHOST",
                    word: p,
                    got: row[p]
                });
            }
        });

        // Invariant 3: identical lookup vector vs reference order.
        if (reference === null) {
            reference = row; refOrder = order.slice();
        } else {
            probes.forEach(function (p) {
                if (row[p] !== reference[p]) {
                    failures.push({
                        label: label,
                        kind: "ORDER-DEPENDENT",
                        probe: p,
                        orderA: refOrder,
                        resultA: reference[p],
                        orderB: order.slice(),
                        resultB: row[p]
                    });
                }
            });
        }
    });
}

SYSTEMATIC.forEach(function (set, i) { auditSet("sys#" + i + " " + JSON.stringify(set), set); });

// Randomized fuzz: random alphabet words over small alphabets (maximizes shared
// prefixes / prefix-word relationships), random orderings + duplicate inserts.
var ALPHABETS = ["ab", "abc", "abcd"];
for (var f = 0; f < 300; f++) {
    var rand = h.rng(0x9e3779b9 ^ (f * 2654435761));
    var alpha = ALPHABETS[f % ALPHABETS.length];
    var n = 2 + Math.floor(rand() * 5) + (f % 10 === 0 ? 4 : 0);
    var words = [];
    var uniq = {};
    while (words.length < n) {
        var len = 1 + Math.floor(rand() * 5);
        var w = "";
        for (var k = 0; k < len; k++) { w += alpha[Math.floor(rand() * alpha.length)]; }
        if (!(w in uniq)) {
            uniq[w] = true;
            words.push(w);
            // sometimes duplicate an existing word
            if (rand() < 0.4) { words.push(words[Math.floor(rand() * (words.length - 1))]); }
        }
    }
    auditSet("fuzz#" + f, words);
}

// Report.
var uniq = {};
failures.forEach(function (fl) {
    var key = fl.kind + "|" + (fl.word || fl.probe) + "|" + JSON.stringify(fl.orderB || fl.order);
    uniq[key] = fl;
});
var list = Object.keys(uniq).map(function (k) { return uniq[k]; });

console.log("orders tested:", ordersTested);
console.log("failure events:", failures.length, " unique:", list.length);
var shown = 0;
list.slice(0, 40).forEach(function (fl) {
    shown++;
    if (fl.kind === "ORDER-DEPENDENT") {
        console.log("\n[ORDER-DEPENDENT] probe=" + JSON.stringify(fl.probe));
        console.log("  A " + fl.resultA + " <-", JSON.stringify(fl.orderA));
        console.log("  B " + fl.resultB + " <-", JSON.stringify(fl.orderB));
    } else {
        console.log("\n[" + fl.kind + "] " + JSON.stringify(fl.word) + " got " + fl.got + " set " + fl.label);
        console.log("  order:", JSON.stringify(fl.order));
    }
});
if (list.length > shown) { console.log("\n... and", list.length - shown, "more"); }
process.exit(list.length ? 1 : 0);
