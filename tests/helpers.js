'use strict';
// Loads the real plugin files with a stand-in for the `obsidian` module, so the
// logic can be tested in plain Node:  node --test tests/
const Module = require('module');
const path = require('path');

class TFile {}
const notices = [];
const obsidian = {
  ItemView: class {}, Modal: class {}, SuggestModal: class {},
  // Like Obsidian: a settings tab takes its id and name from the plugin's manifest.
  PluginSettingTab: class { constructor(app, plugin) { this.app = app; this.plugin = plugin; this.id = plugin.manifest.id; this.name = plugin.manifest.name; } },
  Plugin: class {
    constructor(app, manifest) { this.app = app; this.manifest = manifest; this.calls = []; }
    addRibbonIcon(icon) { this.calls.push(`ribbon ${icon}`); return { addClass() {} }; }
    addStatusBarItem() { return { addClass() {}, setText() {}, setAttr() {}, onclick: null }; }
    addCommand(c) { this.calls.push(`command ${c.id}`); return c; }
    addSettingTab() { this.calls.push('settings'); }
    registerView(t) { this.calls.push(`view ${t}`); }
    registerMarkdownCodeBlockProcessor() {} registerEvent() {} registerInterval(i) { return i; } registerDomEvent() {} register() {}
    async loadData() { return null; } async saveData() {}
  },
  Setting: class {}, MarkdownRenderer: {}, MarkdownView: class {}, Platform: { isDesktopApp: true }, TFile,
  Notice: class { constructor(message) { notices.push(message); } },
};
const load = Module._load;
Module._load = function (request, ...rest) { return request === 'obsidian' ? obsidian : load.call(this, request, ...rest); };
global.window = global;

const built = require(path.join(__dirname, '..', 'main.js')).__test;
module.exports = { TFile, notices, obsidian, Pulse: built.Pulse, Tempo: built.Tasks, Recall: built.Cards, Voice: built.Voice };
