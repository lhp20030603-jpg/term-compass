#!/usr/bin/env node
'use strict';
// Builds main.js and styles.css. No dependencies:  node build.js
// Each folder in MODULES becomes one scope, so modules can reuse short names (h, pad, dkey).
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const MODULES = [['Pulse', 'pulse'], ['Tasks', 'tasks'], ['Cards', 'cards'], ['Voice', 'voice']];
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const folder = (dir, ext) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(ext)).sort().map((f) => read(path.join(dir, f))).join('\n');

let js = '/* Term Compass 学期罗盘 — built by build.js from src/. Edit the sources, not this file. */\n' + folder('src/core', '.js');
for (const [name, dir] of MODULES) js += `\nconst ${name} = (() => {\n${folder(`src/${dir}`, '.js')}\n})();\n`;
js += '\n' + folder('src/host', '.js');
fs.writeFileSync(path.join(ROOT, 'main.js'), js);
fs.writeFileSync(path.join(ROOT, 'styles.css'), folder('styles', '.css'));
console.log(`main.js ${js.split('\n').length} lines`);
