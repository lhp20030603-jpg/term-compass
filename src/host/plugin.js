/* ───────────────────────────── host plugin ───────────────────────────── */

// One settings page; each module draws its own section into it.
class TermCompassSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    this.containerEl.empty();
    for (const section of this.plugin.sections) {
      section.containerEl = this.containerEl.createDiv();
      section.display();
    }
  }
}

class TermCompass extends obsidian.Plugin {
  async onload() {
    this.store = (await this.loadData()) || {};
    this.mods = {}; this.cmds = {}; this.sections = [];
    const parts = [['pulse', Pulse], ['tasks', Tasks], ['cards', Cards]];
    if (obsidian.Platform.isDesktopApp) parts.push(['voice', Voice]);
    for (const [key, Module] of parts) this.mods[key] = new Module(this, key);
    for (const [key] of parts) await this.mods[key].onload();
    this.addSettingTab(new TermCompassSettingTab(this.app, this));
  }

  onunload() { for (const m of Object.values(this.mods)) if (m.onunload) m.onunload(); }

  async saveModule(key, data) { this.store[key] = data; await this.saveData(this.store); }

  /** Run one of our own commands by id; 'term-compass:review' and 'review' both work. */
  run(id) {
    const fn = this.cmds[String(id).split(':').pop()];
    if (!fn) return false;
    fn();
    return true;
  }
}

module.exports = TermCompass;
module.exports.__test = { Pulse, Tasks, Cards, Voice };
