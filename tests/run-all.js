// Runs every node assert-based regression script in this directory.
var fs = require("fs"),
    path = require("path"),
    child_process = require("child_process");

var files = fs.readdirSync(__dirname)
    .filter(function (f) { return /^regression-.*\.js$/.test(f); })
    .sort();

var failed = 0;
files.forEach(function (f) {
    var result = child_process.spawnSync(process.execPath, [path.join(__dirname, f)], {
        stdio: "inherit"
    });
    if (result.status !== 0) { failed++; process.exitCode = 1; }
});

if (!failed) { console.log("\nAll " + files.length + " regression suites passed."); }
