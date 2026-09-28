// Differential testing harness for Bits.js succinct trie.
var path = require("path");

function loadBits() {
    return require(path.resolve(__dirname, "..", "Bits.js"));
}

// Build an encoded FrozenTrie from a list of words (any insertion order).
function build(mod, words) {
    var t = new mod.Trie();
    for (var i = 0; i < words.length; i++) {
        t.insert(words[i]);
    }
    var trie = t.encode();
    var dir = mod.RankDirectory.Create(trie, t.nodeCount * 2 + 1, 32 * 32, 32).getData();
    return {
        frozen: new mod.FrozenTrie(trie, dir, t.nodeCount),
        nodeCount: t.nodeCount,
        trie: trie,
        dir: dir
    };
}

// Deterministic PRNG so a failing seed can be reproduced.
function rng(seed) {
    var s = seed >>> 0;
    return function () {
        s ^= s << 13; s >>>= 0;
        s ^= s >> 17;
        s ^= s << 5; s >>>= 0;
        return s / 4294967296;
    };
}

function shuffle(rand, arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(rand() * (i + 1));
        var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
}

// Permutations (Heap's algorithm), capped to avoid explosion.
function permutations(items, cap) {
    var out = [], a = items.slice();
    cap = cap || Infinity;
    (function gen(n) {
        if (out.length >= cap) { return; }
        if (n === 1) { out.push(a.slice()); return; }
        for (var i = 0; i < n; i++) {
            gen(n - 1);
            if (out.length >= cap) { return; }
            if (n % 2 === 0) {
                var t = a[i]; a[i] = a[n - 1]; a[n - 1] = t;
            } else {
                var u = a[0]; a[0] = a[n - 1]; a[n - 1] = u;
            }
        }
    })(a.length);
    return out;
}

module.exports = {
    loadBits: loadBits,
    build: build,
    rng: rng,
    shuffle: shuffle,
    permutations: permutations
};
