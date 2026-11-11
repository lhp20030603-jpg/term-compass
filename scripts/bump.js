'use strict';
// node scripts/bump.js 0.2.0 [minAppVersion]
// Sets the version in manifest.json and package.json and records it in versions.json.
const fs = require('fs');
const path = require('path');

const [version, minApp] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  process.stderr.write('usage: node scripts/bump.js X.Y.Z [minAppVersion]\n');
  process.exit(1);
}
const file = (name) => path.join(__dirname, '..', name);
const read = (name) => JSON.parse(fs.readFileSync(file(name), 'utf8'));
const write = (name, data) => fs.writeFileSync(file(name), JSON.stringify(data, null, 2) + '\n');

const manifest = read('manifest.json');
manifest.version = version;
if (minApp) manifest.minAppVersion = minApp;
write('manifest.json', manifest);
const pkg = read('package.json');
pkg.version = version;
write('package.json', pkg);
const versions = read('versions.json');
versions[version] = manifest.minAppVersion;
write('versions.json', versions);
process.stdout.write(`version ${version}, needs Obsidian ${manifest.minAppVersion}\n`);
