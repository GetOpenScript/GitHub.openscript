// ==UserScript==
// @name         Display Repo Size for GitHub
// @version      1.2.0
// @description  Displays repository size inside the About section on GitHub (supports public & private repos using GH_PAT).
// @author       OpenScript
// @match        https://github.com/*/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  const cache = new Map();
  const ROW_ID = 'openscript-repo-size-about';

  // Format bytes to human readable format
  const formatSize = bytes => {
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    if (kb < 1024 * 1024) return `${(kb / 1024).toFixed(1)} MB`;
    return `${(kb / (1024 * 1024)).toFixed(2)} GB`;
  };

  // Extract owner & repo from URL
  const getRepoInfo = () => {
    const [, owner, repo] = location.pathname.split('/');
    const reserved = new Set([
      'settings', 'orgs', 'organizations', 'notifications', 'search',
      'features', 'pricing', 'explore', 'marketplace', 'topics', 'trending'
    ]);
    return (owner && repo && !reserved.has(owner)) ? { owner, repo } : null;
  };

  // Safely retrieve GH_PAT from OpenScript environment
  const getPat = () => {
    try {
      const envObj = (typeof OpenScript !== 'undefined' && OpenScript?.env) ||
                     (typeof env !== 'undefined' && env) ||
                     window.OpenScript?.env ||
                     window.env ||
                     {};
      for (const [k, v] of Object.entries(envObj)) {
        if (/^(GH_PAT|GITHUB_PAT|GITHUB_TOKEN|PAT)$/i.test(k) && v) return String(v).trim();
      }
      if (typeof GM_getValue === 'function') {
        const gm = GM_getValue('GH_PAT') || GM_getValue('gh_pat');
        if (gm) return String(gm).trim();
      }
    } catch {
      // ignore
    }
    return null;
  };

  // Fetch repository size from GitHub API (fallback to Git Trees when size is 0)
  const fetchRepoSize = async (owner, repo) => {
    const key = `${owner}/${repo}`;
    if (cache.has(key)) return cache.get(key);

    const pat = getPat();
    const headers = { Accept: 'application/vnd.github.v3+json' };
    if (pat) headers.Authorization = `Bearer ${pat}`;

    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
      if (!res.ok) {
        if (res.status === 404) return pat ? 'repo not found' : 'private (missing GH_PAT)';
        if (res.status === 401) return 'invalid GH_PAT';
        return `API error (${res.status})`;
      }

      const data = await res.json();
      let bytes = (data.size || 0) * 1024;

      // GitHub async calculation fallback: if size is 0, sum blob sizes via Git Trees API
      if (bytes <= 0) {
        const branch = data.default_branch || 'main';
        const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, { headers });
        if (treeRes.ok) {
          const treeData = await treeRes.json();
          bytes = (treeData.tree || []).reduce((acc, item) => acc + (item.size || 0), 0);
        }
      }

      const formatted = formatSize(bytes);
      cache.set(key, formatted);
      return formatted;
    } catch {
      return 'failed to load';
    }
  };

  // Locate the GitHub "About" heading (works on React and classic GitHub pages)
  const findAboutHeading = () => {
    for (const h of document.querySelectorAll('h2')) {
      if (/^\s*About\s*$/i.test(h.textContent.trim())) return h;
    }
    return null;
  };

  // Insert or update size row in About section
  const updateAboutSize = async () => {
    const info = getRepoInfo();
    if (!info) return;

    // Clean up any legacy badges
    document.getElementById('openscript-repo-size')?.remove();

    if (document.getElementById(ROW_ID)) return;

    const heading = findAboutHeading();
    if (!heading) return;

    const row = document.createElement('div');
    row.id = ROW_ID;
    row.className = 'mt-2 text-small color-fg-muted d-flex flex-items-center';
    row.innerHTML = `
      <svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16" class="octicon octicon-database mr-2 color-fg-muted" fill="currentColor">
        <path d="M1 3.5c0-.83.67-1.5 1.5-1.5h11c.83 0 1.5.67 1.5 1.5v9c0 .83-.67 1.5-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9Zm1.5-.5a.5.5 0 0 0-.5.5V5h12V3.5a.5.5 0 0 0-.5-.5h-11ZM14 6H2v2h12V6Zm0 3H2v3.5a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5V9Z"></path>
      </svg>
      <span><strong class="size-val color-fg-default font-semibold">calculating...</strong> repo size</span>
    `;

    // Place directly after description / about heading
    const sibling = heading.nextElementSibling;
    if (sibling) sibling.insertAdjacentElement('afterend', row);
    else heading.insertAdjacentElement('afterend', row);

    const size = await fetchRepoSize(info.owner, info.repo);
    const valEl = row.querySelector('.size-val');
    if (valEl) valEl.textContent = size;
  };

  // Navigation handlers & periodic check during dynamic React sidebar hydration
  const run = () => {
    document.getElementById(ROW_ID)?.remove();
    updateAboutSize();
    let count = 0;
    const timer = setInterval(() => {
      if (document.getElementById(ROW_ID) || ++count > 10) clearInterval(timer);
      else updateAboutSize();
    }, 250);
  };

  ['turbo:load', 'turbo:render', 'pjax:end', 'popstate'].forEach(ev =>
    window.addEventListener(ev, run)
  );

  const observer = new MutationObserver(() => {
    if (!document.getElementById(ROW_ID)) updateAboutSize();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  run();
})();
