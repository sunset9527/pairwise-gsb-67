/*
    Differential regression tests for Bits.js (succinct trie).

    Invariant under test: the set of words stored in a Trie must be exactly
    the set of words that FrozenTrie.lookup() reports as present, no matter
    in which order the words were inserted (sorted, reversed, shuffled, or
    with duplicates). No lost words, no phantom words, no order-dependent
    "shadow" branches.

    Run with: node test-bits.js
*/

var assert = require("assert"),
    fs = require("fs"),
    Bits = require("./Bits.js"),
    Trie = Bits.Trie,
    FrozenTrie = Bits.FrozenTrie,
    RankDirectory = Bits.RankDirectory,
    L1 = Bits.L1,
    L2 = Bits.L2;

/* Deterministic PRNG so failures are reproducible. */
function mulberry32( a ) {
    return function() {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        var t = Math.imul( a ^ a >>> 15, 1 | a );
        t = t + Math.imul( t ^ t >>> 7, 61 | t ) ^ t;
        return (( t ^ t >>> 14 ) >>> 0) / 4294967296;
    };
}

function shuffle( arr, rnd ) {
    var a = arr.slice();
    for ( var i = a.length - 1; i > 0; i-- ) {
        var j = Math.floor( rnd() * ( i + 1 ) ),
            t = a[i];
        a[i] = a[j]; a[j] = t;
    }
    return a;
}

/* Encode a word list (in the given insertion order) into a FrozenTrie. */
function buildFrozenTrie( wordsInOrder ) {
    var trie = new Trie();
    wordsInOrder.forEach( function( w ) { trie.insert( w ); } );
    var data = trie.encode(),
        nodeCount = trie.getNodeCount(),
        dir = RankDirectory.Create( data, nodeCount * 2 + 1, L1, L2 ),
        frozen = new FrozenTrie( data, dir.getData(), nodeCount );
    frozen.__nodeCount = nodeCount;
    return frozen;
}

/* The insertion orders every word set is subjected to. */
function insertionOrders( words, seed ) {
    var rnd = mulberry32( seed ),
        sorted = words.slice().sort(),
        dup = shuffle( words, rnd );
    return [
        sorted,
        sorted.slice().reverse(),
        shuffle( words, rnd ),
        shuffle( words, rnd ),
        dup.concat( dup.slice( 0, Math.ceil( dup.length / 2 ) ) )
    ];
}

/*
    Core differential check: for one set of words, build the trie once per
    insertion order and assert the invariant for every order.
*/
function checkSetAllOrders( wordSet, tag, seed ) {
    var ref = {};
    wordSet.forEach( function( w ) { ref[w] = true; } );
    var words = Object.keys( ref );

    // Probe both member words and near-miss non-words.
    var probes = {};
    words.forEach( function( w ) {
        probes[w] = true;
        probes[w + "a"] = true;
        probes[w + "z"] = true;
        if ( w.length > 1 ) { probes[w.slice( 0, -1 )] = true; }
    } );
    var probeList = Object.keys( probes );

    var baseline = null,
        baseNodes = -1;

    insertionOrders( words, seed ).forEach( function( order, oi ) {
        var ft = buildFrozenTrie( order ),
            label = tag + " order#" + oi + " [" + order.slice( 0, 5 ).join( "," ) + "...]";

        // No shadow branches: node count must not depend on insertion order.
        if ( baseNodes === -1 ) { baseNodes = ft.__nodeCount; }
        assert.strictEqual( ft.__nodeCount, baseNodes,
            label + ": nodeCount differs between insertion orders (shadow branches)" );

        var results = probeList.map( function( p ) { return ft.lookup( p ); } );

        // Every inserted word is found; every non-word is rejected.
        probeList.forEach( function( p, pi ) {
            assert.strictEqual( results[pi], !!ref[p],
                label + ": lookup(" + JSON.stringify( p ) + ") = " + results[pi] +
                ", expected " + !!ref[p] );
        } );

        // Results are identical for every insertion order.
        if ( baseline === null ) { baseline = results; }
        else {
            assert.deepStrictEqual( results, baseline,
                label + ": lookup results depend on insertion order" );
        }
    } );
}

/* ---------- Targeted regressions: out-of-order insert lost words ---------- */

// Inserting "abd" after an unrelated word "x" used to create a duplicate
// "a" branch at the root; lookup("abd") then followed the first "a" branch
// and silently reported false.
( function() {
    var ft = buildFrozenTrie( [ "abc", "x", "abd" ] );
    assert.strictEqual( ft.lookup( "abc" ), true );
    assert.strictEqual( ft.lookup( "abd" ), true );
    assert.strictEqual( ft.lookup( "x" ), true );
    assert.strictEqual( ft.lookup( "ab" ), false );
    assert.strictEqual( ft.lookup( "abe" ), false );
} )();

// A prefix word inserted between two longer words sharing that prefix used
// to lose the second long word for the same reason.
( function() {
    var ft = buildFrozenTrie( [ "abcd", "ab", "abce" ] );
    assert.strictEqual( ft.lookup( "abcd" ), true );
    assert.strictEqual( ft.lookup( "ab" ), true );
    assert.strictEqual( ft.lookup( "abce" ), true );
    assert.strictEqual( ft.lookup( "abcf" ), false );
} )();

// Re-inserting an already-present prefix path must reuse nodes, not
// duplicate them: node count equals the sorted-order build.
( function() {
    var sorted = buildFrozenTrie( [ "abc", "abd", "x" ] ),
        unsorted = buildFrozenTrie( [ "abc", "x", "abd" ] );
    assert.strictEqual( unsorted.__nodeCount, sorted.__nodeCount );
} )();

/* ---------- Systematic word sets x all insertion orders ---------- */

var systematicSets = [
    [ "a", "ab", "abc", "abcd", "abcde" ],           // prefix chain
    [ "abcde", "abcd", "abc", "ab", "a" ],           // reverse prefix chain
    [ "abc", "abd", "abe", "abf" ],                  // common prefix fan-out
    [ "a", "aa", "aaa", "aaaa", "b", "ba", "baa", "baaa" ],
    [ "abc", "x", "abd" ],                           // regression: lost word
    [ "abcd", "ab", "abce" ],                        // regression: prefix mid-stream
    [ "ab", "abc", "b", "bc" ],
    [ "aaaa", "aaab", "aaba", "abaa", "baaa" ],
    [ "cab", "abc", "bab", "aab" ],
    [ "a", "b", "c", "d" ],
    [ "z", "zz", "zzz", "zxy", "zxa" ]               // top of alphabet
];

systematicSets.forEach( function( set, i ) {
    checkSetAllOrders( set, "systematic#" + i, 1000 + i );
} );

// All prefixes of a longer string, in every order.
( function() {
    var word = "abcdabcdab", set = [];
    for ( var i = 1; i <= word.length; i++ ) { set.push( word.slice( 0, i ) ); }
    checkSetAllOrders( set, "all-prefixes", 2000 );
} )();

/* ---------- Randomized differential testing (deterministic seeds) ---------- */

var ALPHA = "abcd";
function randWord( rnd, maxLen ) {
    var len = 1 + Math.floor( rnd() * maxLen ), s = "";
    for ( var i = 0; i < len; i++ ) {
        s += ALPHA[ Math.floor( rnd() * ALPHA.length )];
    }
    return s;
}

// Many small sets: dense prefix/suffix overlap over a tiny alphabet.
for ( var t = 0; t < 100; t++ ) {
    var rnd = mulberry32( t * 7919 + 1 ),
        n = 1 + Math.floor( rnd() * 12 ),
        set = {};
    for ( var k = 0; k < n; k++ ) { set[randWord( rnd, 6 )] = true; }
    checkSetAllOrders( Object.keys( set ), "random-small#" + t, 3000 + t );
}

// Larger sets: nodeCount*2+1 crosses the L1 (1024-bit) rank-directory
// boundary, exercising multi-section rank/select under all orders.
for ( var t2 = 0; t2 < 3; t2++ ) {
    var rnd2 = mulberry32( t2 * 104729 + 7 ),
        big = {},
        target = 400 + Math.floor( rnd2() * 300 );
    while ( Object.keys( big ).length < target ) {
        big[randWord( rnd2, 10 )] = true;
    }
    checkSetAllOrders( Object.keys( big ), "random-big#" + t2, 4000 + t2 );
}

/* ---------- Edge cases ---------- */

// Empty word: marks the root final; must survive any insertion order.
( function() {
    insertionOrders( [ "", "a", "ab" ], 5000 ).forEach( function( order, oi ) {
        var ft = buildFrozenTrie( order );
        assert.strictEqual( ft.lookup( "" ), true, "order#" + oi );
        assert.strictEqual( ft.lookup( "a" ), true, "order#" + oi );
        assert.strictEqual( ft.lookup( "ab" ), true, "order#" + oi );
        assert.strictEqual( ft.lookup( "b" ), false, "order#" + oi );
    } );
} )();

// Duplicate inserts are idempotent.
( function() {
    var once = buildFrozenTrie( [ "abc", "abd" ] ),
        twice = buildFrozenTrie( [ "abc", "abd", "abc", "abc", "abd" ] );
    assert.strictEqual( twice.__nodeCount, once.__nodeCount );
    assert.strictEqual( twice.lookup( "abc" ), true );
    assert.strictEqual( twice.lookup( "abd" ), true );
    assert.strictEqual( twice.lookup( "ab" ), false );
} )();

// Full a-z alphabet coverage, including the 5-bit letter boundary.
( function() {
    var set = [];
    for ( var c = 97; c <= 122; c++ ) {
        var ch = String.fromCharCode( c );
        set.push( ch, ch + ch, "a" + ch, ch + "z" );
    }
    checkSetAllOrders( set, "full-alphabet", 6000 );
} )();

/* ---------- Real dictionary, shuffled vs sorted ---------- */

( function() {
    var words = fs.readFileSync( "dict/string.txt", "utf8" )
        .split( " " ).slice( 0, 2000 ),
        ref = {};
    words.forEach( function( w ) { ref[w] = true; } );

    insertionOrders( words, 7000 ).forEach( function( order, oi ) {
        var ft = buildFrozenTrie( order );
        words.forEach( function( w ) {
            assert.strictEqual( ft.lookup( w ), true,
                "dict order#" + oi + ": lost word " + JSON.stringify( w ) );
        } );
        // Sampled non-words must stay absent.
        for ( var i = 0; i < words.length; i += 20 ) {
            var ghost = words[i] + "zz";
            if ( !ref[ghost] ) {
                assert.strictEqual( ft.lookup( ghost ), false,
                    "dict order#" + oi + ": phantom word " + JSON.stringify( ghost ) );
            }
        }
    } );
} )();

/* ---------- Shipped succinct dictionary still decodes ---------- */

( function() {
    var parts = fs.readFileSync( "dict/succinct.txt", "utf8" ).split( "," ),
        ft = new FrozenTrie( parts[2], parts[1], parseInt( parts[0], 10 ) ),
        words = fs.readFileSync( "dict/string.txt", "utf8" ).split( " " );
    for ( var i = 0; i < words.length; i += 977 ) {
        assert.strictEqual( ft.lookup( words[i] ), true,
            "succinct.txt: lost word " + JSON.stringify( words[i] ) );
    }
    assert.strictEqual( ft.lookup( "aals" ), true );
    assert.strictEqual( ft.lookup( "aalsaals" ), false );
    assert.strictEqual( ft.lookup( "notawordatall" ), false );
} )();

console.log( "test-bits.js: all differential tests passed" );

