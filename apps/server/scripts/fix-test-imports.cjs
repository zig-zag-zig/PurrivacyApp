const fs = require('fs');
const path = require('path');

function findTestFiles(dir) {
    const files = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) files.push(...findTestFiles(full));
        else if (e.name.endsWith('.test.ts')) files.push(full);
    }
    return files;
}

function prefixToRoot(filePath) {
    const rel = path.relative(process.cwd(), filePath);
    const depth = rel.split(path.sep).length - 1; // subtract the file itself
    return '../'.repeat(depth);
}

function prefixToTests(filePath) {
    const rel = path.relative('tests', filePath);
    const depth = rel.split(path.sep).length - 1; // subtract the file itself
    return '../'.repeat(depth);
}

function fixImports(filePath) {
    const toRoot = prefixToRoot(filePath);
    const toTests = prefixToTests(filePath);
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    const original = content;

    // Fix: from "../src/X"  -> from "toRoot + src/X"
    content = content.replace(
        /(from\s+["'])\.\.\/src\//g,
        function (m, pfx) { changed = true; return pfx + toRoot + 'src/'; }
    );

    // Fix: require("../src/X")
    content = content.replace(
        /(require\(["'])\.\.\/src\//g,
        function (m, pfx) { changed = true; return pfx + toRoot + 'src/'; }
    );

    // Fix: jest.mock("../src/X")
    content = content.replace(
        /(jest\.mock\(["'])\.\.\/src\//g,
        function (m, pfx) { changed = true; return pfx + toRoot + 'src/'; }
    );

    // Fix: typeof import("../src/X")
    content = content.replace(
        /(typeof import\(["'])\.\.\/src\//g,
        function (m, pfx) { changed = true; return pfx + toRoot + 'src/'; }
    );

    // Fix: from "./helpers/X"
    content = content.replace(
        /(from\s+["'])\.\/helpers\//g,
        function (m, pfx) { changed = true; return pfx + toTests + 'helpers/'; }
    );

    // Fix: require("./helpers/X")
    content = content.replace(
        /(require\(["'])\.\/helpers\//g,
        function (m, pfx) { changed = true; return pfx + toTests + 'helpers/'; }
    );

    if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('FIXED:', filePath);
        console.log('  toRoot:', toRoot, 'toTests:', toTests);
    }
}

findTestFiles('tests').forEach(fixImports);
