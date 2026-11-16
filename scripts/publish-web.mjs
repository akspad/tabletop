import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deployment = 'formal-cat-696';
const site = `https://${deployment}.convex.site`;

export function contentType(path) {
  return ({
    '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
    '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
    '.otf': 'font/otf', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
  })[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

export async function collectAssets(directory) {
  const assets = [];
  async function visit(relative) {
    for (const entry of await readdir(join(directory, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error('Symlinks are not publishable');
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile()) {
        const body = await readFile(join(directory, name));
        if (body.length > 32 * 1024 * 1024) throw new Error('Asset exceeds the hosting size limit');
        const path = `/${name}`;
        assets.push({ path, contentType: contentType(path), immutable: /[.-][a-f0-9]{16,}\.[^/]+$/i.test(path), body });
      }
      if (assets.length > 500) throw new Error('Export exceeds 500 assets');
    }
  }
  await visit('');
  if (!assets.some(asset => asset.path === '/index.html')) throw new Error('Export is missing index.html');
  return assets.sort((a, b) => a.path.localeCompare(b.path));
}

function runConvex(name, args) {
  let output;
  try {
    output = execFileSync(process.execPath, [
      join(root, 'node_modules/convex/bin/main.js'), 'run', name, JSON.stringify(args),
      '--codegen', 'disable',
    ], { cwd: root, env: { ...process.env, FORCE_COLOR: '0' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    throw new Error(`Convex ${name} failed; verify credentials and deployed hosting functions`);
  }
  try {
    const result = JSON.parse(output);
    if (name === 'hosting:generateUploadUrl' && ![
      `https://${deployment}.convex.cloud`, site,
    ].includes(new URL(result).origin)) throw new Error('Unexpected deployment');
    return result;
  } catch {
    throw new Error(`Convex ${name} returned an unexpected result`);
  }
}

export async function publishAssets(assets, run = runConvex, upload = fetch) {
  const manifest = [];
  for (const { body, ...asset } of assets) {
    const uploadUrl = await run('hosting:generateUploadUrl', {});
    let response;
    try {
      response = await upload(uploadUrl, { method: 'POST', headers: { 'Content-Type': asset.contentType }, body });
    } catch {
      throw new Error('Asset upload failed; the previous site is unchanged');
    }
    if (!response.ok) throw new Error(`Asset upload failed (${response.status}); the previous site is unchanged`);
    let storageId;
    try {
      ({ storageId } = await response.json());
    } catch {
      throw new Error('Asset upload returned invalid JSON; the previous site is unchanged');
    }
    if (typeof storageId !== 'string' || !storageId) throw new Error('Asset upload returned no storage ID');
    manifest.push({ ...asset, storageId });
  }
  return await run('hosting:saveManifest', { assets: manifest });
}

async function main() {
  const flags = process.argv.slice(2);
  if (flags.some(flag => flag !== '--dry-run')) throw new Error('Usage: node scripts/publish-web.mjs [--dry-run]');
  const dryRun = flags.includes('--dry-run');
  if (!dryRun && !process.env.CONVEX_DEPLOY_KEY) throw new Error('CONVEX_DEPLOY_KEY must be provided in the environment');
  const exportEnv = {
    ...process.env,
    EXPO_PUBLIC_CONVEX_URL: `https://${deployment}.convex.cloud`,
    EXPO_PUBLIC_APP_URL: site,
  };
  delete exportEnv.CONVEX_DEPLOY_KEY;
  delete exportEnv.KEIKI_API_KEY;
  delete exportEnv.GH_TOKEN;
  execFileSync(process.execPath, [join(root, 'node_modules/expo/bin/cli'), 'export', '--platform', 'web'], {
    cwd: root, env: exportEnv, stdio: 'inherit',
  });
  const assets = await collectAssets(join(root, 'dist'));
  if (dryRun) {
    console.log(`Export verified: ${assets.length} assets. Dry run: nothing uploaded or deployed.`);
    return;
  }
  await publishAssets(assets);
  console.log(`Published ${assets.length} assets to ${site}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
