// ==UserScript==
// @name         Display Repo and File Sizes for GitHub
// @description  Displays repository disk usage and individual file sizes on GitHub.
// @match        https://github.com/*/*
// ==/UserScript==

const ROW_ID = 'openscript-repo-size-about';
const SIZE_CLASS = 'openscript-file-size';
const TABLE_SELECTOR = 'table[aria-labelledby="folders-and-files"]';

const formatBytes = bytes => {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${unit && size < 10 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
};

const getRepoInfo = () => {
  const [, owner, repo] = location.pathname.split('/');
  const reserved = new Set([
    'settings', 'orgs', 'organizations', 'notifications', 'search',
    'features', 'pricing', 'explore', 'marketplace', 'topics', 'trending',
  ]);
  return owner && repo && !reserved.has(owner) ? { owner, repo } : null;
};

const getPat = () => {
  const values = typeof OpenScript !== 'undefined' ? OpenScript.env :
    typeof env !== 'undefined' ? env : {};
  const found = Object.entries(values).find(([key, value]) =>
    /^(GH_PAT|GITHUB_PAT|GITHUB_TOKEN|PAT)$/i.test(key) && value
  );
  return found ? String(found[1]).trim() : '';
};

const getHeaders = () => {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const pat = getPat();
  if (pat) headers.Authorization = `Bearer ${pat}`;
  return headers;
};

const fetchRepoSize = async ({ owner, repo }) => {
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: getHeaders(),
    });
    if (response.status === 404)
      return { text: 'private (missing GH_PAT)', title: 'Set GH_PAT in OpenScript for private repository access' };
    if (response.status === 401)
      return { text: 'invalid GH_PAT', title: 'GitHub rejected the configured token' };
    if (!response.ok)
      return { text: `API error (${response.status})`, title: `GitHub API returned ${response.status}` };

    const kb = (await response.json()).size || 0;
    return kb ? {
      text: formatBytes(kb * 1024),
      title: `Total repository disk usage (including full git history): ${kb.toLocaleString()} KB`,
    } : {
      text: '0 KB (calculating...)',
      title: 'GitHub is still calculating disk usage for this repository',
    };
  } catch {
    return { text: 'failed to load', title: 'Network or fetch error' };
  }
};

const getCodeView = () => {
  try {
    const app = document.querySelector('react-app[app-name="code-view"]');
    const data = JSON.parse(app?.querySelector('script[type="application/json"]')?.textContent || '{}');
    const payload = data.payload || {};
    const route = payload.codeViewRepoRoute || payload.codeViewTreeRoute;
    const info = getRepoInfo();
    if (!info || !route?.tree?.items || !route.refInfo) return null;

    const path = String(route.path || '').replace(/^\/+|\/+$/g, '');
    const ref = route.refInfo.currentOid || route.refInfo.name;
    return {
      ...info, path, ref, items: route.tree.items,
      key: `${info.owner}/${info.repo}:${ref}:${path}`,
    };
  } catch {
    return null;
  }
};

const findAboutHeading = () => [...document.querySelectorAll('h2')].find(heading =>
  /^\s*About\s*$/i.test(heading.textContent) &&
  heading.closest('[data-component="SplitPageLayout.Pane"], .Layout-sidebar, .BorderGrid')
);

const updateAboutSize = async () => {
  const info = getRepoInfo();
  if (!info) return;

  const key = `${info.owner}/${info.repo}`;
  const existing = document.getElementById(ROW_ID);
  if (existing?.dataset.repo === key) return;
  existing?.remove();
  document.getElementById('openscript-repo-size')?.remove();

  const heading = findAboutHeading();
  if (!heading) return;

  const row = document.createElement('div');
  row.id = ROW_ID;
  row.dataset.repo = key;
  row.className = 'mt-2 text-small color-fg-muted d-flex flex-items-center';
  row.innerHTML = `
    <svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16" class="octicon octicon-database mr-2 color-fg-muted" fill="currentColor">
      <path d="M1 3.5c0-.83.67-1.5 1.5-1.5h11c.83 0 1.5.67 1.5 1.5v9c0 .83-.67 1.5-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9Zm1.5-.5a.5.5 0 0 0-.5.5V5h12V3.5a.5.5 0 0 0-.5-.5h-11ZM14 6H2v2h12V6Zm0 3H2v3.5a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5V9Z"></path>
    </svg>
    <span><strong class="size-val color-fg-default font-semibold">calculating...</strong> repo size</span>`;

  const sibling = heading.nextElementSibling;
  (sibling || heading).insertAdjacentElement('afterend', row);

  const size = await fetchRepoSize(info);
  if (!row.isConnected) return;
  row.querySelector('.size-val').textContent = size.text;
  row.title = size.title;
};

const addFileSize = (row, name, bytes) => {
  for (const cell of row.querySelectorAll(
    'td.react-directory-row-name-cell-small-screen, td.react-directory-row-name-cell-large-screen'
  )) {
    const link = cell.querySelector('a.Link--primary[href*="/blob/"]');
    const column = link?.closest('.react-directory-filename-column');
    if (!column || link.title !== name || column.querySelector(`:scope > .${SIZE_CLASS}`)) continue;

    const text = formatBytes(bytes);
    const badge = document.createElement('span');
    badge.className = `${SIZE_CLASS} color-fg-muted`;
    badge.textContent = text;
    badge.title = `File size: ${bytes.toLocaleString()} bytes`;
    Object.assign(badge.style, {
      flex: 'none', marginLeft: '8px', fontSize: '12px', fontWeight: '400', whiteSpace: 'nowrap',
    });
    column.append(badge);
  }
};

const updateFileSizes = async () => {
  const view = getCodeView();
  const table = document.querySelector(TABLE_SELECTOR);
  if (!view || !table) return;

  const fileLinks = table.querySelectorAll(
    'td[class*="react-directory-row-name-cell"] a.Link--primary[href*="/blob/"]'
  );
  if (table.dataset.openscriptFileSizes === view.key &&
      table.querySelectorAll(`.${SIZE_CLASS}`).length === fileLinks.length) return;

  if (table.dataset.openscriptFileSizes !== view.key)
    table.querySelectorAll(`.${SIZE_CLASS}`).forEach(size => size.remove());
  table.dataset.openscriptFileSizes = view.key;

  const path = view.path ? `/${view.path.split('/').map(encodeURIComponent).join('/')}` : '';
  try {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(view.owner)}/${encodeURIComponent(view.repo)}/contents${path}?ref=${encodeURIComponent(view.ref)}`,
      { headers: getHeaders() },
    );
    if (!response.ok) return;
    const entries = await response.json();
    if (!Array.isArray(entries) || getCodeView()?.key !== view.key || !table.isConnected) return;

    const sizes = Object.fromEntries(entries.map(item => [item.path, item.size]));
    const paths = Object.fromEntries(view.items
      .filter(item => item.contentType === 'file')
      .map(item => [item.name, item.path]));

    for (const row of table.querySelectorAll('tbody tr')) {
      const link = row.querySelector(
        'td[class*="react-directory-row-name-cell"] a.Link--primary[href*="/blob/"]'
      );
      const name = link?.title;
      const bytes = sizes[paths[name]];
      if (Number.isFinite(bytes)) addFileSize(row, name, bytes);
    }
  } catch {
    // Leave GitHub's UI untouched when the API is unavailable.
  }
};

let scheduled;
const run = () => {
  clearTimeout(scheduled);
  scheduled = setTimeout(() => {
    updateAboutSize();
    updateFileSizes();
  }, 50);
};

['turbo:load', 'turbo:render', 'pjax:end', 'popstate'].forEach(event =>
  window.addEventListener(event, run)
);

const start = () => {
  new MutationObserver(run).observe(document.body, { childList: true, subtree: true });
  run();
};

if (document.body) start();
else window.addEventListener('DOMContentLoaded', start, { once: true });
