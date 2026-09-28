// Stronger differential audit:
//  * independent oracle (Set membership) over exhaustive + random probes
//  * cross-order equality of nodeCount AND encoded bytes (trie + directory)
var h = require("./_harness.js");

var ctx = h.loadBits();

var failures = [];
var ordersTested = 0;

function auditSet(words, label) {
    var memberSet = {};
    words.forEach(function (w) { memberSet[w] = true; });
    var members = Object.keys(memberSet);

    // Build an exhaustive probe set over the alphabet actually used, up to the
    // max word length, plus random probes over a wider alphabet.
    var alpha = {};
    words.join("").split("").forEach(function (c) { alpha[c] = true; });
    var letters = Object.keys(alpha).sort();
    var rawMax = words.reduce(function (m, w) { return Math.max(m, w.length); }, 0);
    var maxLen = Math.min(rawMax, 4);

    var probes = {};
    (function gen(prefix, depth) {
        if (prefix) { probes[prefix] = true; }
        if (depth === maxLen) { return; }
        for (var i = 0; i < letters.length; i++) {
            gen(prefix + letters[i], depth + 1);
        }
    })("", 0);

    var rand = h.rng(12345 + members.length * 131);
    var fullAlpha = "abcdefghijklmnopqrstuvwxyz";
    for (var r = 0; r < 200; r++) {
        var len = 1 + Math.floor(rand() * (maxLen + 2));
        var s = "";
        for (var k = 0; k < len; k++) { s += fullAlpha[Math.floor(rand() * 26)]; }
        probes[s] = true;
    }
    var probeList = Object.keys(probes);

    // Ordering variants.
    var orders;
    if (words.length <= 6) {
        orders = h.permutations(words, 120);
    } else {
        orders = [words.slice().sort(), words.slice().sort().reverse()];
        for (var s = 1; s <= 40; s++) {
            orders.push(h.shuffle(h.rng(s * 977 + words.length), words));
        }
    }

    var ref = null;
    orders.forEach(function (order) {
        ordersTested++;
        var built = h.build(ctx, order);

        // Invariant 1 & 2: lookup must equal the oracle for every probe.
        for (var i = 0; i < probeList.length; i++) {
            var p = probeList[i];
            var expected = !!memberSet[p];
            var got = built.frozen.lookup(p);
            if (got !== expected) {
                failures.push({
                    label: label, order: order.slice(), probe: p,
                    expected: expected, got: got
                });
            }
        }

        // Invariant 3: structural equality across orders.
        var sig = built.nodeCount + "|" + built.trie + "|" + built.dir;
        if (ref === null) {
            ref = { sig: sig, order: order.slice() };
        } else if (sig !== ref.sig) {
            failures.push({
                label: label, kind: "STRUCT",
                orderA: ref.order, orderB: order.slice()
            });
        }
    });
}

// Tight systematic sets covering prefix/cache/shadow/duplicate edge cases.
[
    ["a", "ab"], ["ab", "a"], ["abc", "ab"], ["ab", "abc"],
    ["abc", "bc", "axx"], ["abcd", "ab"], ["ab", "abcd", "abce"],
    ["abc", "abd", "a", "ab"], ["abc", "x", "abc"], ["ab", "ab", "a", "a"],
    ["a", "b", "ab"], ["ab", "ba", "a", "b"],
    ["aaa", "aab", "aac", "aa"], ["rat", "rate", "ratify", "ratified"],
    ["the", "there", "their", "they", "them"]
].forEach(function (s, i) { auditSet(s, "sys#" + i); });

// Fuzz: dense shared-prefix vocabularies on tiny alphabets, with duplicates.
["ab", "abc"].forEach(function (a, ai) {
    for (var f = 0; f < 60; f++) {
        var rand = h.rng(0x51ed270b ^ (f * 40503 + ai * 1000003));
        var n = 2 + Math.floor(rand() * 6);
        var words = [], seen = {};
        while (words.length < n) {
            var len = 1 + Math.floor(rand() * 5);
            var w = "";
            for (var k = 0; k < len; k++) { w += a[Math.floor(rand() * a.length)]; }
            if (!(w in seen)) {
                seen[w] = true;
                words.push(w);
                if (rand() < 0.4) {
                    words.push(words[Math.floor(rand() * (words.length - 1))]);
                }
            }
        }
        auditSet(words, "fuzz#" + ai + ":" + f);
    }
});

console.log("orders tested:", ordersTested, "failures:", failures.length);
failures.slice(0, 20).forEach(function (fl) {
    if (fl.kind === "STRUCT") {
        console.log("[STRUCT]", fl.label, JSON.stringify(fl.orderA), "!= ", JSON.stringify(fl.orderB));
    } else {
        console.log("[" + (fl.got ? "GHOST" : "DROP") + "]", JSON.stringify(fl.probe),
            "expected", fl.expected, "got", fl.got, "set", fl.label);
        console.log("   order:", JSON.stringify(fl.order));
    }
});
process.exit(failures.length ? 1 : 0);
