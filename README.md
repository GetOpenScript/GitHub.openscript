# Display Repo Size for GitHub (OpenScript Userscript)

A lightweight OpenScript userscript that displays the total repository size (including all commit history, branches, tags, and packfiles) directly in the **About** section on GitHub repository pages (for both public and private repositories).

## Features
- **Accurate Git History Size**: Uses GitHub's native `repo.size` disk usage measurement, accurately reflecting the full Git history, delta compression, and packfiles rather than loose blobs.
- **New Repo Handling**: If a repository was just pushed and GitHub is still computing initial disk usage (`0 KB`), it provides a friendly indicator (`0 KB (calculating...)`) until GitHub finishes indexing.
- **Integrated in About Section**: Injects cleanly under repository details in the right sidebar.
- **Private Repositories Supported**: Uses `GH_PAT` from OpenScript secrets for private repositories and increased rate limits.
- **Turbo / SPA Compatible**: Seamlessly persists across GitHub's Turbo and client-side page transitions.

## Installation in OpenScript
1. Open the **OpenScript** extension popup.
2. Click **+ New** in the header (or click your existing script to edit).
3. Paste the contents of [`DisplayRepoSizeGitHub.user.js`](./DisplayRepoSizeGitHub.user.js).
4. Click **save script**.

## GitHub PAT Configuration (for Private Repos)
1. Generate a GitHub Personal Access Token (`repo` scope for private repos) at [github.com/settings/tokens](https://github.com/settings/tokens).
2. Open **OpenScript** and switch to the **Secrets** tab.
3. Add a secret:
   - **Key**: `GH_PAT`
   - **Value**: `<your_token>`
4. Click **+ Add**. OpenScript synchronizes the secret via `chrome.storage.sync` and securely provides it to your script as `OpenScript.env.GH_PAT`.
