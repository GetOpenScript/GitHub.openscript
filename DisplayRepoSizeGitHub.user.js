// ==UserScript==
// @name         Display Repo Size for GitHub
// @version      1.0.0
// @description  Displays the total repository size on GitHub repository pages (supports public & private repos via GH_PAT).
// @author       OpenScript
// @match        https://github.com/*/*
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  const cache = new Map();
  const BADGE_ID = 'openscript-repo-size';

  // Format KB to readable size
  const formatBytes = kb => {
    if (kb < 1024) return `${kb} KB`;
    if (kb < 1024 * 1024) return `${(kb / 1024).toFixed(1)} MB`;
    return `${(kb / (1024 * 1024)).toFixed(2)} GB`;
  };

  // Parse owner & repo from path
  const getRepoInfo = () => {
    const [, owner, repo] = location.pathname.split('/');
    const reserved = new Set(['settings', 'orgs', 'organizations', 'notifications', 'search', 'features', 'pricing', 'explore']);
    return (owner && repo && !reserved.has(owner)) ? { owner, repo } : null;
  };

  // Fetch size from GitHub API with optional GH_PAT
  const fetchRepoSize = async (owner, repo) => {
    const key = `${owner}/${repo}`;
    if (cache.has(key)) return cache.get(key);

    const token = window.OpenScript?.env?.GH_PAT || window.env?.GH_PAT;
    const headers = { Accept: 'application/vnd.github.v3+json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
      if (!res.ok) return res.status === 404 ? 'private/missing GH_PAT' : 'error';
      const data = await res.json();
      const formatted = formatBytes(data.size);
      cache.set(key, formatted);
      return formatted;
    } catch {
      return null;
    }
  };

  // Inject or update size badge
  const updateBadge = async () => {
    const info = getRepoInfo();
    if (!info) return;

    // Anchor locations on GitHub repo pages
    const anchor = document.querySelector('.file-navigation') ||
                   document.querySelector('[data-testid="latest-commit-details"]') ||
                   document.querySelector('.BorderGrid-cell .d-flex') ||
                   document.querySelector('#repository-container-header ul');

    if (!anchor || document.getElementById(BADGE_ID)) return;

    const badge = document.createElement('div');
    badge.id = BADGE_ID;
    badge.className = 'd-inline-flex flex-items-center mr-2 px-2 py-1 text-bold text-small rounded-2 border color-border-default color-bg-subtle';
    badge.style.cssText = 'align-self: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;';
    badge.innerHTML = `
      <svg aria-hidden="true" height="14" viewBox="0 0 16 16" width="14" class="octicon octicon-database mr-1 color-fg-muted" fill="currentColor">
        <path d="M1 3.5c0-.83.67-1.5 1.5-1.5h11c.83 0 1.5.67 1.5 1.5v9c0 .83-.67 1.5-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9Zm1.5-.5a.5.5 0 0 0-.5.5V5h12V3.5a.5.5 0 0 0-.5-.5h-11ZM14 6H2v2h12V6Zm0 3H2v3.5a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5V9Z"></path>
      </svg>
      <span class="size-text color-fg-default">calculating...</span>
    `;

    anchor.prepend(badge);

    const size = await fetchRepoSize(info.owner, info.repo);
    const sizeSpan = badge.querySelector('.size-text');
    if (sizeSpan) sizeSpan.textContent = size ? size : 'unknown';
  };

  // Re-run on Turbo navigation & DOM mutations
  ['turbo:load', 'turbo:render', 'pjax:end', 'popstate'].forEach(ev => 
    window.addEventListener(ev, () => {
      document.getElementById(BADGE_ID)?.remove();
      updateBadge();
    })
  );

  const observer = new MutationObserver(() => {
    if (!document.getElementById(BADGE_ID)) updateBadge();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  updateBadge();
})();
