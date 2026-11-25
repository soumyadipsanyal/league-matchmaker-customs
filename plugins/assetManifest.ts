import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * Exposes `virtual:asset-manifest`: the list of image files that exist under
 * `public/assets`, as paths relative to the site root (e.g.
 * "assets/champions/Shen.png").
 *
 * The app only requests images that are on this list, so a missing icon never
 * causes a 404 in the console: it just shows the placeholder. In dev, adding or
 * removing a file reloads the page so the new image shows straight away.
 */
const ID = 'virtual:asset-manifest';
const RESOLVED = '\0' + ID;
const IMAGE = /\.(png|jpe?g|webp|gif|svg)$/i;

function scan(publicDir: string): string[] {
  const root = path.join(publicDir, 'assets');
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (IMAGE.test(e.name)) out.push(path.relative(publicDir, full).split(path.sep).join('/'));
    }
  };
  walk(root);
  return out.sort();
}

export function assetManifest(): Plugin {
  let publicDir = '';
  return {
    name: 'thursday-customs:asset-manifest',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    resolveId(id) {
      return id === ID ? RESOLVED : undefined;
    },
    load(id) {
      if (id !== RESOLVED) return undefined;
      return `export default ${JSON.stringify(scan(publicDir))};`;
    },
    configureServer(server) {
      const dir = path.join(publicDir, 'assets');
      server.watcher.add(dir);
      const refresh = (file: string) => {
        if (!path.resolve(file).startsWith(path.resolve(dir))) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', refresh);
      server.watcher.on('unlink', refresh);
    },
  };
}
