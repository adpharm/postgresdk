---
title: "CLI reference"
description: "Every postgresdk CLI command and option, captured from `postgresdk help`."
---

:::caution[Generated file — do not edit by hand]
This page is generated from `src/cli.ts (via `postgresdk help`)` by `task docs:gen`.
Edit the source and regenerate; manual changes are overwritten.
:::


`postgresdk` is a code generator: it introspects a PostgreSQL schema and emits a
typed Hono API server and TypeScript client SDK. Run it with `bunx postgresdk@latest <command>`
(or `npx` / `pnpm dlx`).

## Commands

| Command | Description |
| --- | --- |
| `init` | Create a postgresdk.config.ts file |
| `pull` | Pull SDK from API endpoint |
| `version` | Show version |
| `help` | Show help |


## Full help output

The following is the verbatim output of `postgresdk help`:

```text
postgresdk - Generate typed SDK from PostgreSQL

Usage:
  postgresdk <command> [options]

Commands:
  init                 Create a postgresdk.config.ts file
  generate, gen        Generate SDK from database
  pull                 Pull SDK from API endpoint
  version              Show version
  help                 Show help

Init Options:
  (no options)

Generate Options:
  -c, --config <path>  Path to config file (default: postgresdk.config.ts)
  --force, -y          Delete stale files without prompting

Pull Options:
  --from <url>         API URL to pull SDK from
  --output <path>      Output directory (default: ./src/sdk)
  --token <token>      Authentication token
  --force, -y          Delete stale files without prompting
  -c, --config <path>  Path to config file with pull settings

Examples:
  postgresdk init                        # Create config file
  postgresdk generate                    # Generate using postgresdk.config.ts
  postgresdk gen                         # Short alias for generate
  postgresdk generate -c custom.config.ts
  postgresdk pull --from=https://api.com --output=./src/sdk
  postgresdk pull                        # Pull using config file
```
