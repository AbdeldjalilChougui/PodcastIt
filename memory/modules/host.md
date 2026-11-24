---
tags:
  - memory
  - module
  - podcastit
last_updated: 2026-11-24
related_files:
  - "src/host/connect.ts"
  - "src/host/mock.ts"
  - "src/host/types.ts"
---

# Host

**Purpose:** \`HostApi\` interface (subset of AnnaAppRuntime), real adapter, local mock.

## Main
- \`connectHost()\` — mock in \`--mode mock\`; else requires \`?wid&t\` and imports the SDK.
- \`createMockHost()\` — fake LLM/TTS (synth WAV), localStorage storage, in-memory uploads. URL flags: \`mockFast=1\`, \`mockFail=tts|quota\`, \`theme=dark\`.

> [!warning]
> Mock is tree-shaken from prod; verify with grep for "honeybees" in \`bundle/\`. SDK methods resolve with result and reject Error{code,details}.

Used by: [[ui]], [[pipeline]]

See also: [[decisions]], [[architecture]]
