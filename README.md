# Display Repo Size for GitHub (OpenScript Userscript)

A lightweight OpenScript userscript that displays the total repository size directly on GitHub repository pages (for both public and private repositories).

## Features
- Displays total repo size (formatted in KB, MB, or GB) next to the file navigation header.
- Works seamlessly on public and private repositories.
- Integrates with OpenScript's synced secrets: uses `GH_PAT` (GitHub Personal Access Token) to authenticate API requests, unlock private repo access, and elevate the rate limit from 60 to 5,000 req/hr.
- Supports GitHub's Turbo and SPA client-side navigations.

## Installation in OpenScript
1. Open the **OpenScript** extension popup.
2. Click **+ New** in the header.
3. Copy and paste the code from [`DisplayRepoSizeGitHub.user.js`](./DisplayRepoSizeGitHub.user.js) into the editor.
4. Click **save script**.

## Private Repos & GitHub PAT Configuration
To view the size of private repositories:
1. Generate a GitHub Personal Access Token (`repo` scope for private repos) at [github.com/settings/tokens](https://github.com/settings/tokens).
2. Open **OpenScript** and switch to the **Secrets** tab.
3. Add a secret with:
   - **Key**: `GH_PAT`
   - **Value**: `<your_personal_access_token>`
4. Click **+ Add**. The secret will sync across your devices via `chrome.storage.sync` and will be automatically available to the script.
