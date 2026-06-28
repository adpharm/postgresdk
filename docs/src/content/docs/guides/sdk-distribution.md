---
title: SDK distribution (pull)
description: Serve the generated client SDK over HTTP and pull it into client apps.
sidebar:
  order: 4
---

When you run `generate`, the client SDK is bundled into the server output and served over HTTP, so
client apps can **pull** it directly from your running API.

## On the server

The generator embeds the SDK as `sdk-bundle.ts` and exposes:

- `GET /_psdk/sdk/manifest` — lists files and metadata
- `GET /_psdk/sdk/download` — the complete bundle
- `GET /_psdk/sdk/files/:path` — individual files

Protect these endpoints by setting [`pullToken`](/reference/configuration/#config) (use the
`env:` form). If unset, they're public.

## On the client

Pull with flags:

```bash
bunx postgresdk@latest pull --from=https://api.myapp.com --output=./src/sdk
```

Or, recommended, configure `pull` in `postgresdk.config.ts` and run `pull` with no args:

```ts
// postgresdk.config.ts in the client app
export default {
  pull: {
    from: "https://api.myapp.com",
    output: "./src/sdk",
    pullToken: "env:POSTGRESDK_PULL_TOKEN", // if the server sets one
  },
};
```

```bash
bunx postgresdk@latest pull
```

Then use it like any generated SDK:

```ts
import { SDK } from "./src/sdk";
const sdk = new SDK({ baseUrl: "https://api.myapp.com" });
```

See [`PullConfig`](/reference/configuration/#pullconfig) for all options.

## Stale-file cleanup

Both `generate` and `pull` remove files no longer part of the SDK. Interactive terminals prompt
per deletion; pass `--force` (or `-y`) to skip prompts. In CI (non-interactive), stale files are
skipped with a warning unless `--force` is given.
