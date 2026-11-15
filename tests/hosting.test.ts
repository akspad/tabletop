import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convexTest } from 'convex-test';
import { describe, expect, it, vi } from 'vitest';
import { internal } from '../convex/_generated/api';
import schema from '../convex/schema';
import { generateUploadUrl, saveManifest } from '../convex/hosting';
import { collectAssets, contentType, publishAssets } from '../scripts/publish-web.mjs';

const modules = import.meta.glob('../convex/**/*.ts');
const chunkPath = '/_expo/static/js/web/index-0123456789abcdef0123456789abcdef.js';

async function fixture() {
  const t = convexTest(schema, modules);
  const indexId = await t.run(async ctx => await ctx.storage.store(new Blob(['<html>Tabletop</html>'])));
  const chunkId = await t.run(async ctx => await ctx.storage.store(new Blob(['globalThis.ready=true;'])));
  const assets = [
    { path: '/index.html', storageId: indexId, contentType: 'text/html; charset=utf-8', immutable: false },
    { path: chunkPath, storageId: chunkId, contentType: 'application/javascript; charset=utf-8', immutable: true },
  ];
  await t.mutation(internal.hosting.saveManifest, { assets });
  return { t, assets };
}

describe('durable web hosting', () => {
  it('serves the root index without redirecting or consuming the guest code', async () => {
    const { t } = await fixture();
    const response = await t.fetch('/?code=ABC123');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<html>Tabletop</html>');
    expect(response.headers.get('Location')).toBeNull();
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('Content-Security-Policy')).toBeNull();
    expect((await t.fetch('/index.html')).status).toBe(200);
  });

  it('serves hashed Metro chunks with the JavaScript type and immutable caching', async () => {
    const { t } = await fixture();
    const response = await t.fetch(chunkPath);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('globalThis.ready=true;');
    expect(response.headers.get('Content-Type')).toBe('application/javascript; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });

  it('returns noncached 404s for missing assets, bad encodings, and deleted blobs', async () => {
    const { t, assets } = await fixture();
    for (const path of ['/missing.js', '/room/ABC123', '/%FF']) {
      const response = await t.fetch(path);
      expect(response.status).toBe(404);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.text()).not.toContain('<html>');
    }
    await t.run(async ctx => await ctx.storage.delete(assets[1].storageId));
    expect((await t.fetch(chunkPath)).status).toBe(404);
  });

  it('publishes atomically while preserving old chunks and removing stale mutable paths', async () => {
    const { t, assets } = await fixture();
    await t.mutation(internal.hosting.saveManifest, { assets: [
      ...assets, { ...assets[0], path: '/old.txt', contentType: 'text/plain; charset=utf-8' },
    ] });
    const newIndex = await t.run(async ctx => await ctx.storage.store(new Blob(['new index'])));
    await t.mutation(internal.hosting.saveManifest, { assets: [{ ...assets[0], storageId: newIndex }] });
    expect(await (await t.fetch('/')).text()).toBe('new index');
    expect((await t.fetch(chunkPath)).status).toBe(200);
    expect((await t.fetch('/old.txt')).status).toBe(404);
    const missing = await t.run(async ctx => await ctx.storage.store(new Blob(['missing'])));
    await t.run(async ctx => await ctx.storage.delete(missing));
    await expect(t.mutation(internal.hosting.saveManifest, { assets: [assets[0], { ...assets[1], storageId: missing }] })).rejects.toThrow('missing');
    expect(await (await t.fetch('/')).text()).toBe('new index');
  });

  it('rejects duplicate, unsafe, empty, and incorrectly cached manifests', async () => {
    const { t, assets } = await fixture();
    const invalid = [
      [], [assets[1]], [assets[0], assets[0]],
      [assets[0], { ...assets[1], path: '/../private.js' }],
      [assets[0], { ...assets[1], path: '/plain.js' }],
      [assets[0], { ...assets[1], contentType: 'text/plain\r\nX-Unsafe: yes' }],
      [{ ...assets[0], immutable: true }],
    ];
    for (const manifest of invalid) await expect(t.mutation(internal.hosting.saveManifest, { assets: manifest })).rejects.toThrow();
    expect(await (await t.fetch('/')).text()).toBe('<html>Tabletop</html>');
  });

  it('has internal-only publishing functions and no HTTP upload route', async () => {
    expect((generateUploadUrl as unknown as { isInternal: boolean }).isInternal).toBe(true);
    expect((saveManifest as unknown as { isInternal: boolean }).isInternal).toBe(true);
    const { t } = await fixture();
    expect((await t.fetch('/', { method: 'POST', body: 'unauthorized' })).status).toBe(404);
    expect(await t.mutation(internal.hosting.generateUploadUrl, {})).toEqual(expect.any(String));
  });
});

describe('web publisher', () => {
  it('collects root and nested Metro assets with appropriate MIME and caching', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tabletop-hosting-'));
    try {
      await mkdir(join(directory, '_expo/static/js/web'), { recursive: true });
      await writeFile(join(directory, 'index.html'), '<html/>');
      await writeFile(join(directory, chunkPath), 'chunk');
      const assets = await collectAssets(directory);
      expect(assets).toHaveLength(2);
      expect(assets.find(asset => asset.path === '/index.html')).toMatchObject({ contentType: 'text/html; charset=utf-8', immutable: false });
      expect(assets.find(asset => asset.path === chunkPath)).toMatchObject({ contentType: 'application/javascript; charset=utf-8', immutable: true });
      expect(contentType('/font.woff2')).toBe('font/woff2');
      expect(contentType('/logo.svg')).toBe('image/svg+xml');
      expect(contentType('/unknown')).toBe('application/octet-stream');
      await symlink(join(directory, 'index.html'), join(directory, 'linked.html'));
      await expect(collectAssets(directory)).rejects.toThrow('Symlinks');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects incomplete exports', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tabletop-hosting-'));
    try {
      await expect(collectAssets(directory)).rejects.toThrow('index.html');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('saves the manifest only after all blobs have uploaded', async () => {
    const events: string[] = [];
    const assets = ['/index.html', chunkPath].map(path => ({ path, contentType: contentType(path), immutable: path !== '/index.html', body: Buffer.from(path) }));
    const run = vi.fn(async (name: string) => {
      events.push(name);
      return name.endsWith('generateUploadUrl') ? 'https://upload.invalid/private-token' : { published: 2 };
    });
    const upload = vi.fn(async () => {
      events.push('upload');
      return new Response(JSON.stringify({ storageId: 'stored' }));
    });
    await expect(publishAssets(assets, run, upload)).resolves.toEqual({ published: 2 });
    expect(events).toEqual(['hosting:generateUploadUrl', 'upload', 'hosting:generateUploadUrl', 'upload', 'hosting:saveManifest']);
    expect(run.mock.calls.at(-1)).toEqual(['hosting:saveManifest', { assets: assets.map(({ body, ...asset }) => ({ ...asset, storageId: 'stored' })) }]);
    expect(upload.mock.calls[0]).toMatchObject(['https://upload.invalid/private-token', { method: 'POST', headers: { 'Content-Type': 'text/html; charset=utf-8' } }]);
  });

  it('does not activate a partial export or expose upload URLs in failures', async () => {
    const assets = [{ path: '/index.html', contentType: contentType('/index.html'), immutable: false, body: Buffer.from('index') }];
    const run = vi.fn(async (_name: string, _args: unknown) => 'https://upload.invalid/private-token');
    for (const upload of [
      async () => new Response('failure', { status: 500 }),
      async () => new Response('not JSON'),
      async () => new Response('{}'),
      async () => { throw new Error('https://upload.invalid/private-token'); },
    ]) {
      await expect(publishAssets(assets, run, upload)).rejects.toThrow(/^Asset upload/);
    }
    expect(run.mock.calls.every(([name]) => name === 'hosting:generateUploadUrl')).toBe(true);
  });
});
