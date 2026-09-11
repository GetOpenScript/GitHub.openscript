# GitHub OpenScripts

Small, independent [OpenScript](https://github.com/GetOpenScript/OpenScript) enhancements for GitHub. Install any combination of scripts.

## Scripts

### Display Repo Info and File Sizes

[`DisplayRepoInfo.os.js`](./DisplayRepoInfo.os.js) adds repository information and file sizes directly to GitHub's interface.

- Shows total repository disk usage and repository age in the **About** sidebar.
- Shows the exact repository creation date and time on hover.
- Adds human-readable sizes beside files in root and nested directory listings.
- Handles GitHub SPA navigation without requiring a page refresh.
- Uses GitHub-native layout, colors, and responsive filename cells.
- Supports private repositories through an optional `GH_PAT` secret.

This script requests repository metadata when the **About** section is rendered and directory contents when a GitHub file listing is rendered. It guards in-progress directory requests to avoid duplicate API calls during DOM updates.

### Download GitHub Directory

[`DownloadDir.os.js`](./DownloadDir.os.js) adds **Download directory** to the three-dot menu on GitHub directory pages.

- Makes no GitHub requests on page load, navigation, or menu opening.
- Starts all download-related requests only after **Download directory** is clicked.
- Uses one recursive Git Trees API request for a normal public repository, then retrieves file bytes from `raw.githubusercontent.com` without spending additional REST API quota.
- Falls back to additional tree requests only when GitHub truncates an unusually large recursive tree response.
- Downloads private repository files through authenticated Git blob requests.
- Builds the ZIP locally in the browser with JSZip and preserves the selected directory as its root folder.
- Handles GitHub SPA navigation and branch names containing slashes.

OpenScript downloads and caches the declared JSZip `@require` when the script is saved. It is not downloaded again on every GitHub page.

### Meaningful Icons for GitHub

[`meaningful-icons.os.js`](./meaningful-icons.os.js) replaces GitHub's generic file and folder glyphs with type-aware Material icons.

- Recognizes file names, compound extensions, folders, submodules, symlinks, and GitHub Actions workflows.
- Works in repository listings, the file tree, and release download lists.
- Handles GitHub SPA navigation, expanded folders, and light/dark theme changes.
- Uses a vendored copy of the same MIT-licensed Material Icon Theme data and SVG assets as the credited Material Icons for GitHub extension.
- Downloads only the icons a page needs from this repository, falls back to the pinned npm package, then caches them in per-script OpenScript storage.

No asset folder or manual icon download is needed when installing the script. Its vendored assets live in [`vendor/material-icon-theme-5.38.1`](./vendor/material-icon-theme-5.38.1) and are loaded from `raw.githubusercontent.com`; `cdn.jsdelivr.net` is a redundant fallback. Previously cached icons remain available if both hosts are temporarily unreachable. The script and vendor directory contain the upstream copyright notices, licenses, credits, and third-party licensing references.

## Installation

Each file is a separate OpenScript:

1. Open the **OpenScript** extension popup.
2. Click **+ New**.
3. Paste the contents of the script you want to install.
4. Click **save script**.
5. Repeat for the other script if you want both features.

After updating an installed script, save it again and refresh the current GitHub page once. Later GitHub navigation works without refreshing.

## Private Repositories

Both scripts support a GitHub personal access token stored in OpenScript:

1. Create a GitHub token with read access to the required private repositories.
2. Open OpenScript and select the **Secrets** tab.
3. Add `GH_PAT` as the key and the token as its value.
4. Click **+ Add**, then re-save the scripts.

The scripts also recognize `GITHUB_PAT`, `GITHUB_TOKEN`, and `PAT`. Tokens are sent only to `api.github.com` and are never included in generated ZIP files.
