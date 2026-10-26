---
name: External data retrieval
description: Workspace shell networking may be blocked even when CodeExecution can fetch public source files.
---

During the IPEDS directory import, `curl` from the workspace shell could not reach an external API, while `fetch` inside CodeExecution succeeded and allowed the source archive to be staged into the workspace.

**Why:** External-data refreshes can otherwise get stuck retrying a network path that is unavailable in the shell.

**How to apply:** For future public dataset updates, try CodeExecution fetch and stage the downloaded file into the workspace for local parsing instead of repeatedly retrying shell `curl`.
