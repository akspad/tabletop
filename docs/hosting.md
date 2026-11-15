# Durable web guests

The public guest page is **https://formal-cat-696.convex.site/**. Share a table link as `https://formal-cat-696.convex.site/?code=ABC123`. A guest needs only a browser, not Expo Go. The Expo app connects to `https://formal-cat-696.convex.cloud` for realtime gameplay.

This uses supported [Convex HTTP actions](https://docs.convex.dev/functions/http-actions), [upload URLs](https://docs.convex.dev/file-storage/upload-files), and [storage Blob responses](https://docs.convex.dev/file-storage/serve-files). It does not depend on a development server, machine preview, tunnel, service worker, or custom domain.

## Publish

Run from the repository root after dependencies are installed:

```sh
node scripts/publish-web.mjs --dry-run
```

This exports Expo web into `dist/` and validates the asset count, sizes, and root index without changing Convex. Coordinate with the backend owner before deploying the current schema/functions to the existing deployment. The `webAssets` table and `hosting`/`http` functions must be deployed before the first publication.

Once deployment is authorized and complete, provide `CONVEX_DEPLOY_KEY` through the environment and run:

```sh
node scripts/publish-web.mjs
```

The script runs `expo export --platform web`, forces the public app/backend URLs above, and invokes the installed Convex CLI with admin credentials inherited through the environment. Deployment selection comes from the deploy key; upload URL origins are checked against the expected deployment before sending any files. It never deploys backend code. The deploy key is removed from the Expo export subprocess environment. Never put it in app configuration, a public Expo variable, a shell command argument, a commit, or browser code.

Upload URL generation and manifest publication are **internal mutations**, not browser-callable endpoints. Upload URLs and CLI output are captured, never printed. Each exported file is POSTed to its generated upload URL; only after every upload succeeds does one mutation atomically update the path-to-storage manifest. A failed upload leaves the published site unchanged. A failed final call can be retried by publishing again; inspect the site if the failure was an ambiguous network timeout.

## Serving and caching

`GET /` serves `index.html` directly; query parameters such as `?code=ABC123` remain in the browser address. `GET /index.html` and nonhashed assets use `Cache-Control: no-cache`. The action sets one-year immutable caching for hashed chunk filenames. Old hashed chunks remain addressable so an already-open page can finish loading after a new publication. Missing paths and deleted storage files return 404; there is no catch-all HTML fallback for missing JavaScript.

Live verification on November 15, 2026 found that the hosted edge normalizes some cache headers: chunk responses retain `public, max-age=31536000` but omit the action's `immutable` directive. Missing assets return 404 with edge `Cache-Control: public, max-age=14400` and `CF-Cache-Status: BYPASS`, despite the action setting `no-store`. The index's `no-cache` header is preserved. Content-hashed chunk URLs are never reused for changed content, so long-lived caching remains safe.

Content types cover HTML, Metro JavaScript, CSS, JSON, common images, fonts, media, and WASM. Successful responses set `nosniff`, deny framing, and use a conservative referrer policy. No CSP is added, so Expo's generated inline scripts are not blocked.

## Verify

```sh
npx vitest run tests/hosting.test.ts
curl -i 'https://formal-cat-696.convex.site/?code=ABC123'
curl -i 'https://formal-cat-696.convex.site/does-not-exist.js'
```

After publishing, open the root page in a phone browser, join a real table via its code link, refresh to confirm seat restoration, and verify a second player receives realtime updates. Check that exported Metro chunks load as JavaScript and use immutable caching. Local tests cover HTTP routing, bytes, MIME, cache policy, atomic publication, missing assets, and publisher upload failures; they do not prove a deployment has happened.

## Scope and limits

This small hosting layer accepts at most 500 files per publish and 32 MiB per file, below Convex's documented 100 MiB HTTP response limit. Every request runs an HTTP action and reads storage; normal Convex usage/storage billing applies. This is a durable hackathon deployment, not a CDN replacement. It deliberately retains uploaded files and old immutable chunks; repeated publications accumulate storage. Cleanup and rollback tooling are not included. Only publish public-safe build assets: storage files are public website content, not a place for secrets.
