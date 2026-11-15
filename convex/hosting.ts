import { v } from 'convex/values';
import { internal } from './_generated/api';
import { httpAction, internalMutation, internalQuery } from './_generated/server';

export const generateUploadUrl = internalMutation({
  args: {},
  handler: async ctx => await ctx.storage.generateUploadUrl(),
});

export const saveManifest = internalMutation({
  args: {
    assets: v.array(v.object({
      path: v.string(), storageId: v.id('_storage'), contentType: v.string(), immutable: v.boolean(),
    })),
  },
  handler: async (ctx, { assets }) => {
    if (assets.length === 0 || assets.length > 500) throw new Error('Publish requires 1–500 assets');
    if (!assets.some(asset => asset.path === '/index.html' && asset.contentType === 'text/html; charset=utf-8' && !asset.immutable)) {
      throw new Error('Publish requires an uncached index.html');
    }
    const paths = new Set<string>();
    for (const asset of assets) {
      if (!asset.path.startsWith('/') || asset.path === '/' || asset.path.length > 2048 ||
          /[\\?#\u0000-\u001f]/.test(asset.path) || asset.path.split('/').slice(1).some(part => !part || part === '.' || part === '..')) {
        throw new Error('Invalid asset path');
      }
      if (paths.has(asset.path)) throw new Error('Duplicate asset path');
      paths.add(asset.path);
      if (!/^[\w.+-]+\/[\w.+-]+(?:; charset=utf-8)?$/.test(asset.contentType)) throw new Error('Invalid content type');
      if (asset.immutable && !/[.-][a-f0-9]{16,}\.[^/]+$/i.test(asset.path)) throw new Error('Immutable assets need hashed names');
      const file = await ctx.db.system.get(asset.storageId);
      if (!file) throw new Error('Asset upload is missing');
      if (file.size > 32 * 1024 * 1024) throw new Error('Asset exceeds the hosting size limit');
    }
    const existing = await ctx.db.query('webAssets').collect();
    const byPath = new Map(existing.map(asset => [asset.path, asset]));
    for (const asset of assets) {
      const previous = byPath.get(asset.path);
      if (previous) await ctx.db.replace(previous._id, asset);
      else await ctx.db.insert('webAssets', asset);
    }
    for (const previous of existing) {
      if (!previous.immutable && !paths.has(previous.path)) await ctx.db.delete(previous._id);
    }
    return { published: assets.length };
  },
});

export const asset = internalQuery({
  args: { path: v.string() },
  handler: async (ctx, { path }) => await ctx.db.query('webAssets').withIndex('by_path', q => q.eq('path', path)).unique(),
});

export const serve = httpAction(async (ctx, request): Promise<Response> => {
  let path: string;
  try {
    path = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const entry = await ctx.runQuery(internal.hosting.asset, { path: path === '/' ? '/index.html' : path });
  const blob = entry ? await ctx.storage.get(entry.storageId) : null;
  if (!entry || !blob) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new Response(blob, {
    headers: {
      'Content-Type': entry.contentType,
      'Cache-Control': entry.immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
    },
  });
});
