// ==UserScript==
// @name         Display Repo Info and File Sizes for GitHub
// @version      1.0.0
// @description  Displays repository disk usage, age, and individual file sizes on GitHub.
// @match        https://github.com/*/*
// ==/UserScript==

const ROW_ID = 'openscript-repo-info-about';
const SIZE_CLASS = 'openscript-file-size';
const TABLE_SELECTOR = 'table[aria-labelledby="folders-and-files"]';
const SIZE_LOADS = new WeakMap();

const formatBytes = b => {
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  for (; b >= 1024 && i < 3; i++) b /= 1024;
  return `${i && b < 10 ? b.toFixed(1) : Math.round(b)} ${u[i]}`;
};

const formatAge = d => {
  const days = Math.max(0, Math.floor((Date.now() - new Date(d)) / 864e5));
  const y = Math.floor(days / 365.25);
  const m = Math.floor((days % 365.25) / 30.44);
  if (y) return `${y} year${y > 1 ? 's' : ''}${m ? `, ${m} month${m > 1 ? 's' : ''}` : ''}`;
  if (m) return `${m} month${m > 1 ? 's' : ''}`;
  return `${days || '< 1'} day${days === 1 ? '' : 's'}`;
};

const getRepoInfo = () => {
  const [, owner, repo] = location.pathname.split('/');
  return owner && repo && !/^(settings|orgs|organizations|notifications|search|features|pricing|explore|marketplace|topics|trending)$/i.test(owner)
    ? { owner, repo } : null;
};

const getPat = () => {
  const envObj = typeof OpenScript !== 'undefined' ? OpenScript.env : typeof env !== 'undefined' ? env : {};
  const [, val] = Object.entries(envObj || {}).find(([k, v]) => /^(GH_PAT|GITHUB_PAT|GITHUB_TOKEN|PAT)$/i.test(k) && v) || [];
  return val ? String(val).trim() : '';
};

const getHeaders = () => {
  const pat = getPat();
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(pat && { Authorization: `Bearer ${pat}` }),
  };
};

const fetchRepoInfo = async ({ owner, repo }) => {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: getHeaders(),
    });
    if (res.status === 404)
      return { err: 'private (missing GH_PAT)', tip: 'Set GH_PAT in OpenScript for private repository access' };
    if (res.status === 401)
      return { err: 'invalid GH_PAT', tip: 'GitHub rejected the configured token' };
    if (!res.ok)
      return { err: `API error (${res.status})`, tip: `GitHub API returned ${res.status}` };

    const { size: kb = 0, created_at: created } = await res.json();
    return {
      size: {
        text: kb ? formatBytes(kb * 1024) : '0 KB (calculating...)',
        tip: kb ? `Total repository disk usage (including full git history): ${kb.toLocaleString()} KB`
          : 'GitHub is still calculating disk usage for this repository',
      },
      age: created ? {
        text: formatAge(created),
        tip: `Created: ${new Date(created).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' })}`,
      } : null,
    };
  } catch {
    return { err: 'failed to load', tip: 'Network or fetch error' };
  }
};

const decode = value => {
  try { return decodeURIComponent(value); }
  catch { return value; }
};

const getRefPath = () => {
  const ref = document.querySelector('#ref-picker-repos-header-ref-selector')?.textContent.trim();
  if (!ref) return null;
  const parts = location.pathname.split('/').slice(1).map(decode);
  if (parts[2] !== 'tree') return { ref, path: '' };
  const tail = parts.slice(3).join('/');
  if (tail !== ref && !tail.startsWith(`${ref}/`)) return null;
  return { ref, path: tail.slice(ref.length).replace(/^\/+/, '') };
};

const getCodeView = () => {
  try {
    const info = getRepoInfo();
    const current = getRefPath();
    if (!info || !current) return null;
    return { ...info, ...current, key: `${info.owner}/${info.repo}:${current.ref}:${current.path}` };
  } catch {
    return null;
  }
};

const findAboutHeading = () => [...document.querySelectorAll('h2')].find(h =>
  /^\s*About\s*$/i.test(h.textContent) &&
  h.closest('[data-component="SplitPageLayout.Pane"], .Layout-sidebar, .BorderGrid')
);

const updateAboutInfo = async () => {
  const info = getRepoInfo();
  if (!info) return;

  const key = `${info.owner}/${info.repo}`;
  const existing = document.getElementById(ROW_ID);
  if (existing?.dataset.repo === key) return;
  existing?.remove();
  document.getElementById('openscript-repo-size-about')?.remove();
  document.getElementById('openscript-repo-size')?.remove();

  const heading = findAboutHeading();
  if (!heading) return;

  const container = document.createElement('div');
  container.id = ROW_ID;
  container.dataset.repo = key;
  container.innerHTML = `
    <div class="openscript-size-row mt-2 text-small color-fg-muted d-flex flex-items-center">
      <svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16" class="octicon octicon-database mr-2 color-fg-muted" fill="currentColor">
        <path d="M1 3.5c0-.83.67-1.5 1.5-1.5h11c.83 0 1.5.67 1.5 1.5v9c0 .83-.67 1.5-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9Zm1.5-.5a.5.5 0 0 0-.5.5V5h12V3.5a.5.5 0 0 0-.5-.5h-11ZM14 6H2v2h12V6Zm0 3H2v3.5a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5V9Z"></path>
      </svg>
      <span><strong class="size-val color-fg-default font-semibold">calculating...</strong> repo size</span>
    </div>
    <div class="openscript-age-row mt-2 text-small color-fg-muted d-flex flex-items-center">
      <svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16" class="octicon octicon-history mr-2 color-fg-muted" fill="currentColor">
        <path d="m.427 1.927 1.215 1.215a8.002 8.002 0 1 1-1.6 5.685.75.75 0 1 1 1.493-.154 6.5 6.5 0 1 0 1.18-4.458l1.358 1.358A.25.25 0 0 1 3.896 6H.25A.25.25 0 0 1 0 5.75V2.104a.25.25 0 0 1 .427-.177ZM7.75 4a.75.75 0 0 1 .75.75v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5A.75.75 0 0 1 7.75 4Z"></path>
      </svg>
      <span><strong class="age-val color-fg-default font-semibold">calculating...</strong> repo age</span>
    </div>`;

  const sibling = heading.nextElementSibling;
  (sibling || heading).insertAdjacentElement('afterend', container);

  const res = await fetchRepoInfo(info);
  if (!container.isConnected) return;
  const sRow = container.querySelector('.openscript-size-row');
  const aRow = container.querySelector('.openscript-age-row');
  if (res.err) {
    sRow.querySelector('.size-val').textContent = res.err;
    sRow.title = res.tip;
    aRow.remove();
  } else {
    sRow.querySelector('.size-val').textContent = res.size.text;
    sRow.title = res.size.tip;
    if (res.age) {
      aRow.querySelector('.age-val').textContent = res.age.text;
      aRow.title = res.age.tip;
    } else aRow.remove();
  }
};

const addFileSize = (row, name, bytes) => {
  for (const cell of row.querySelectorAll('td.react-directory-row-name-cell-small-screen, td.react-directory-row-name-cell-large-screen')) {
    const link = cell.querySelector('a.Link--primary[href*="/blob/"]');
    const col = link?.closest('.react-directory-filename-column');
    if (!col || link.title !== name || col.querySelector(`:scope > .${SIZE_CLASS}`)) continue;

    const badge = document.createElement('span');
    badge.className = `${SIZE_CLASS} color-fg-muted`;
    badge.textContent = formatBytes(bytes);
    badge.title = `File size: ${bytes.toLocaleString()} bytes`;
    Object.assign(badge.style, { flex: 'none', marginLeft: '8px', fontSize: '12px', fontWeight: '400', whiteSpace: 'nowrap' });
    col.append(badge);
  }
};

const updateFileSizes = async () => {
  const view = getCodeView();
  const table = document.querySelector(TABLE_SELECTOR);
  if (!view || !table) return;

  const links = table.querySelectorAll('td[class*="react-directory-row-name-cell"] a.Link--primary[href*="/blob/"]');
  if (table.dataset.openscriptFileSizes === view.key &&
      (table.querySelectorAll(`.${SIZE_CLASS}`).length === links.length || SIZE_LOADS.get(table) === view.key)) return;

  if (table.dataset.openscriptFileSizes !== view.key)
    table.querySelectorAll(`.${SIZE_CLASS}`).forEach(el => el.remove());
  table.dataset.openscriptFileSizes = view.key;
  SIZE_LOADS.set(table, view.key);

  const path = view.path ? `/${view.path.split('/').map(encodeURIComponent).join('/')}` : '';
  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(view.owner)}/${encodeURIComponent(view.repo)}/contents${path}?ref=${encodeURIComponent(view.ref)}`,
      { headers: getHeaders() },
    );
    if (!res.ok) return;
    const entries = await res.json();
    if (!Array.isArray(entries) || getCodeView()?.key !== view.key || !table.isConnected) return;

    const sizes = Object.fromEntries(entries.map(item => [item.name, item.size]));

    for (const row of table.querySelectorAll('tbody tr')) {
      const link = row.querySelector('td[class*="react-directory-row-name-cell"] a.Link--primary[href*="/blob/"]');
      const bytes = sizes[link?.title];
      if (Number.isFinite(bytes)) addFileSize(row, link.title, bytes);
    }
  } catch {}
  finally {
    if (SIZE_LOADS.get(table) === view.key) SIZE_LOADS.delete(table);
  }
};

let scheduled;
const run = () => {
  clearTimeout(scheduled);
  scheduled = setTimeout(() => {
    updateAboutInfo();
    updateFileSizes();
  }, 50);
};

['turbo:load', 'turbo:render', 'pjax:end', 'popstate'].forEach(ev =>
  window.addEventListener(ev, run)
);

const start = () => {
  new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
  run();
};

if (document.documentElement) start();
else window.addEventListener('DOMContentLoaded', start, { once: true });
