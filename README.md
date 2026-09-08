# Display Repo Size for GitHub (OpenScript Userscript)

A lightweight OpenScript userscript that displays the total repository size directly in the **About** section on GitHub repository pages (for both public and private repositories).

## Features
- **Integrated in About Section**: Injects cleanly under repository details in the right sidebar (e.g. `📦 673.9 KB repo size`).
- **Accurate Size Detection**: Automatically detects when GitHub's API returns `0 KB` on newly created repositories and falls back to calculating the total content size via the Git Trees API.
- **Private & Public Repositories**: Works on public repositories out-of-the-box and uses `GH_PAT` from OpenScript secrets for private repositories.
- **Turbo / SPA Compatible**: Seamlessly persists across GitHub's Turbo and client-side page transitions.

## Installation in OpenScript
1. Open the **OpenScript** extension popup.
2. Click **+ New** in the header.
3. Paste the contents of [`DisplayRepoSizeGitHub.user.js`](./DisplayRepoSizeGitHub.user.js).
4. Click **save script**.

## GitHub PAT Configuration (for Private Repos)
1. Generate a GitHub Personal Access Token (`repo` scope for private repos) at [github.com/settings/tokens](https://github.com/settings/tokens).
2. Open **OpenScript** and switch to the **Secrets** tab.
3. Add a secret:
   - **Key**: `GH_PAT`
   - **Value**: `<your_token>`
4. Click **+ Add**. OpenScript synchronizes the secret via `chrome.storage.sync` and securely provides it to your script as `OpenScript.env.GH_PAT`.
