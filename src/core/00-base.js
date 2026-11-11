'use strict';
/*
 * Term Compass 学期罗盘 — one Obsidian plugin made of four modules:
 *   Pulse  the dashboard (what to do now, courses, deadlines, habits, levels)
 *   Tasks  tasks, quick notes and the recording panel in the side bar
 *   Cards  flashcards made from your notes
 *   Voice  lecture recording with local transcription (desktop only)
 * Each module lives in its own scope (see build.js) and talks to the plugin
 * through SubModule, so modules never reach into Obsidian's private plugin list.
 */
const obsidian = require('obsidian');

// Split a Markdown table row on | but not on an escaped \|. No lookbehind: iOS before 16.4 cannot parse it.
const splitRow = (line) => line.replace(/\\\|/g, '\u0000').split('|').map((c) => c.replace(/\u0000/g, '\\|'));

/** What a module needs from a Plugin, forwarded to the one real plugin instance. */
class SubModule {
  // manifest too: Obsidian's PluginSettingTab reads the plugin's manifest id and name.
  constructor(host, key) { this.host = host; this.key = key; this.app = host.app; this.manifest = host.manifest; }
  peer(name) { return (this.host && this.host.mods && this.host.mods[name]) || null; }
  async loadData() { return this.host.store[this.key] || null; }
  async saveData(data) { await this.host.saveModule(this.key, data); }
  addCommand(c) { this.host.cmds[c.id] = c.callback || (() => {}); return this.host.addCommand(c); }
  addSettingTab(tab) { this.host.sections.push(tab); }
  addRibbonIcon(...a) { return this.host.addRibbonIcon(...a); }
  addStatusBarItem() { return this.host.addStatusBarItem(); }
  registerView(...a) { return this.host.registerView(...a); }
  registerEvent(e) { return this.host.registerEvent(e); }
  registerInterval(id) { return this.host.registerInterval(id); }
  registerDomEvent(...a) { return this.host.registerDomEvent(...a); }
  registerMarkdownCodeBlockProcessor(...a) { return this.host.registerMarkdownCodeBlockProcessor(...a); }
  register(fn) { return this.host.register(fn); }
}
