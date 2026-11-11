/* ───────────────────────────── daily backup ───────────────────────────── */

const expandHome = (p) => (p.startsWith('~/') ? require('path').join(require('os').homedir(), p.slice(2)) : p);
const staleBackups = (names, keep) => names.filter((n) => /^学期罗盘备份-\d{4}-\d{2}-\d{2}\.tgz$/.test(n)).sort().reverse().slice(keep);

function backupLine(b) {
  if (!b) return '还没有自动备份';
  if (b.error) return `⚠️ 自动备份失败：${b.error}`;
  const d = new Date(b.at);
  return `上次备份 ${mdd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function tarVault(vault, file, audioFolder, configDir) {
  const path = require('path');
  const { spawn } = require('child_process');
  const cfg = configDir || '.obsidian';
  const skip = ['*/.trash', `*/${cfg}/workspace*`, `*/${cfg}/plugins/term-compass/recovery`, `*/${audioFolder}/*`].flatMap((x) => ['--exclude', x]);
  return new Promise((resolve, reject) => {
    const tar = spawn('tar', ['-czf', file, ...skip, '-C', path.dirname(vault), path.basename(vault)], { env: Object.assign({}, process.env, { COPYFILE_DISABLE: '1' }) });
    let err = '';
    tar.stderr.on('data', (d) => { err = (err + d).slice(-300); });
    tar.on('error', reject);
    tar.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || `tar 退出码 ${code}`))));
  });
}

// Recordings never change, so they are copied once rather than packed into every archive.
async function mirrorAudio(src, dest) {
  const fs = require('fs'), path = require('path');
  if (!fs.existsSync(src)) return;
  await fs.promises.mkdir(dest, { recursive: true });
  for (const name of await fs.promises.readdir(src)) {
    const from = path.join(src, name), to = path.join(dest, name);
    const a = await fs.promises.stat(from);
    const b = await fs.promises.stat(to).catch(() => null);
    if (a.isFile() && (!b || b.size !== a.size)) await fs.promises.copyFile(from, to);
  }
}

/**
 * Pack the vault into o.dest, mirror the recordings, then drop the oldest archives.
 * The parent of o.dest must exist: creating it would fake a cloud folder that never syncs.
 */
async function runBackup(o) {
  const fs = require('fs'), path = require('path');
  if (!fs.existsSync(path.dirname(o.dest))) throw new Error(`找不到 ${path.dirname(o.dest)}`);
  await fs.promises.mkdir(o.dest, { recursive: true });
  const name = `学期罗盘备份-${o.today}.tgz`, part = path.join(o.dest, `.${name}.part`);
  try {
    await tarVault(o.vault, part, o.audioFolder, o.configDir);
    await fs.promises.rename(part, path.join(o.dest, name));
  } catch (e) {
    await fs.promises.rm(part, { force: true });
    throw e;
  }
  await mirrorAudio(path.join(o.vault, o.audioFolder), path.join(o.dest, '录音'));
  for (const old of staleBackups(await fs.promises.readdir(o.dest), o.keep)) await fs.promises.unlink(path.join(o.dest, old));
  return (await fs.promises.stat(path.join(o.dest, name))).size;
}
