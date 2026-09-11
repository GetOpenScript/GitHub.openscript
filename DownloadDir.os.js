// ==UserScript==
// @name         Download GitHub Directory
// @version      1.0.0
// @description  Adds a rate-limit-friendly directory download option to GitHub.
// @match        https://github.com/*/*
// @require      https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js
// ==/UserScript==

const ITEM_ATTR = 'data-openscript-download-dir';
const MENU_BUTTON = 'button[data-testid="tree-overflow-menu-anchor"]';
let active = false;

const getPat = () => {
  const source = typeof OpenScript !== 'undefined' ? OpenScript.env : typeof env !== 'undefined' ? env : {};
  const [, value] = Object.entries(source || {}).find(([key, val]) =>
    /^(GH_PAT|GITHUB_PAT|GITHUB_TOKEN|PAT)$/i.test(key) && val
  ) || [];
  return value ? String(value).trim() : '';
};

const decode = value => {
  try { return decodeURIComponent(value); }
  catch { return value; }
};

const getView = () => {
  try {
    const parts = location.pathname.split('/').slice(1).map(decode);
    if (parts[2] !== 'tree') return null;
    const ref = document.querySelector('#ref-picker-repos-header-ref-selector')?.textContent.trim();
    const tail = parts.slice(3).join('/');
    if (!ref || tail === ref || !tail.startsWith(`${ref}/`)) return null;

    const app = document.querySelector('react-app[app-name="code-view"]');
    const payload = JSON.parse(app?.querySelector('script[type="application/json"]')?.textContent || '{}').payload;
    const info = payload?.codeViewLayoutRoute?.repo;
    const commit = document.querySelector('a[aria-label^="Commit "][href*="/commit/"]')
      ?.getAttribute('href')?.match(/\/commit\/([0-9a-f]{40,64})(?:$|[/?#])/i)?.[1];
    return {
      owner: parts[0], repo: parts[1], ref,
      path: tail.slice(ref.length + 1), oid: commit || ref,
      private: info?.private === true,
    };
  } catch {
    return null;
  }
};

const api = async (view, path, accept = 'application/vnd.github+json') => {
  const pat = getPat();
  const res = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(view.owner)}/${encodeURIComponent(view.repo)}${path}`,
    { headers: {
      Accept: accept,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(pat && { Authorization: `Bearer ${pat}` }),
    } },
  );
  if (res.ok) return res;

  if (res.status === 403 && res.headers.get('X-RateLimit-Remaining') === '0')
    throw new Error('GitHub API rate limit reached. Add GH_PAT in OpenScript or try again after the reset.');
  if (res.status === 404 && !pat)
    throw new Error('Directory data is unavailable. Private repositories require GH_PAT in OpenScript.');
  throw new Error(`GitHub API request failed (${res.status}).`);
};

const tree = async (view, sha, recursive = false) =>
  (await api(view, `/git/trees/${encodeURIComponent(sha)}${recursive ? '?recursive=1' : ''}`)).json();

const walkTree = async (view) => {
  let sha = view.oid;
  for (const name of view.path.split('/')) {
    const data = await tree(view, sha);
    const next = data.tree?.find(item => item.type === 'tree' && item.path === name);
    if (!next) throw new Error('Could not locate this directory in the repository tree.');
    sha = next.sha;
  }

  const files = [];
  const queue = [{ sha, path: '' }];
  while (queue.length) {
    const current = queue.shift();
    const data = await tree(view, current.sha);
    for (const item of data.tree || []) {
      const path = current.path ? `${current.path}/${item.path}` : item.path;
      if (item.type === 'tree') queue.push({ sha: item.sha, path });
      else if (item.type === 'blob') files.push({ ...item, path: `${view.path}/${path}`, relative: path });
    }
  }
  return files;
};

const listFiles = async view => {
  const data = await tree(view, view.oid, true);
  if (data.truncated) return walkTree(view);

  const prefix = `${view.path}/`;
  return (data.tree || [])
    .filter(item => item.type === 'blob' && item.path?.startsWith(prefix))
    .map(item => ({ ...item, relative: item.path.slice(prefix.length) }));
};

const fileData = async (view, file) => {
  if (!view.private) {
    const path = file.path.split('/').map(encodeURIComponent).join('/');
    try {
      const raw = await fetch(
        `https://raw.githubusercontent.com/${encodeURIComponent(view.owner)}/${encodeURIComponent(view.repo)}/${view.oid}/${path}`
      );
      if (raw.ok) return raw.arrayBuffer();
    } catch {}
  }
  return (await api(view, `/git/blobs/${encodeURIComponent(file.sha)}`, 'application/vnd.github.raw+json')).arrayBuffer();
};

const notice = (message, error = false) => {
  const box = document.createElement('div');
  box.className = `flash ${error ? 'flash-error' : 'flash-success'}`;
  box.setAttribute('role', error ? 'alert' : 'status');
  box.textContent = message;
  Object.assign(box.style, {
    position: 'fixed', top: '72px', right: '16px', zIndex: 2147483647,
    maxWidth: '420px', boxShadow: 'var(--shadow-floating-small)',
  });
  document.body.append(box);
  setTimeout(() => box.remove(), error ? 9000 : 5000);
};

const saveZip = async (view, setLabel) => {
  if (view.private && !getPat())
    throw new Error('Private repositories require GH_PAT in OpenScript.');
  if (!globalThis.JSZip) throw new Error('JSZip did not load. Re-save the script to refresh its @require cache.');

  setLabel('Reading directory…');
  const files = await listFiles(view);
  if (!files.length) throw new Error('This directory has no downloadable files.');

  const root = view.path.split('/').at(-1);
  const zip = new JSZip();
  let done = 0;
  let failure;
  const queue = [...files];
  const worker = async () => {
    while (queue.length && !failure) {
      const file = queue.shift();
      try {
        zip.file(`${root}/${file.relative}`, await fileData(view, file));
        setLabel(`Downloading ${++done}/${files.length}…`);
      } catch (error) {
        failure ||= error;
        queue.length = 0;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, files.length) }, worker));
  if (failure) throw failure;

  setLabel('Creating ZIP…');
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safe = `${view.repo}-${view.path}-${view.oid.slice(0, 7)}`.replace(/[^\w.-]+/g, '-');
  link.href = url;
  link.download = `${safe}.zip`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  notice(`Downloaded ${root} (${files.length.toLocaleString()} files).`);
};

const download = async (item, label) => {
  if (active) return notice('Another directory download is already running.', true);
  const view = getView();
  if (!view) return notice('Could not read the current GitHub directory.', true);

  active = true;
  item.setAttribute('aria-disabled', 'true');
  const setLabel = text => { if (label.isConnected) label.textContent = text; };
  try {
    await saveZip(view, setLabel);
  } catch (error) {
    notice(error?.message || 'Directory download failed.', true);
  } finally {
    active = false;
    item.removeAttribute('aria-disabled');
    setLabel('Download directory');
  }
};

const inject = () => {
  const view = getView();
  const anchor = document.querySelector(MENU_BUTTON);
  if (!view || !anchor) return;

  const labelledBy = anchor.getAttribute('aria-labelledby');
  const menu = [...document.querySelectorAll('ul[role="menu"]')].find(el =>
    el.getAttribute('aria-labelledby') === labelledBy
  );
  if (!menu || menu.querySelector(`[${ITEM_ATTR}]`)) return;

  const source = [...menu.children].find(el =>
    el.getAttribute('role') === 'menuitem' && /Copy permalink/i.test(el.textContent)
  ) || menu.querySelector(':scope > li[role="menuitem"]');
  if (!source) return;

  const item = source.cloneNode(true);
  item.setAttribute(ITEM_ATTR, '');
  item.setAttribute('aria-label', 'Download directory');
  item.setAttribute('tabindex', '-1');
  item.removeAttribute('aria-labelledby');
  item.removeAttribute('aria-keyshortcuts');
  item.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  item.querySelector('[data-component="ActionList.TrailingVisual"]')?.remove();
  const label = item.querySelector('[data-component="ActionList.Item.Label"]');
  if (!label) return;
  label.textContent = 'Download directory';
  item.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    download(item, label);
  });

  const deletion = [...menu.children].find(el => el.querySelector('a[href*="/tree/delete/"]'));
  const divider = [...menu.children].find(el => el.dataset.component === 'ActionList.Divider');
  if (deletion) menu.insertBefore(item, deletion);
  else if (divider) divider.after(item);
  else menu.prepend(item);
};

let scheduled;
const run = () => {
  clearTimeout(scheduled);
  scheduled = setTimeout(inject, 30);
};

['turbo:load', 'turbo:render', 'pjax:end', 'popstate'].forEach(event =>
  window.addEventListener(event, run)
);

const start = () => {
  new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
  run();
};

if (document.documentElement) start();
else window.addEventListener('DOMContentLoaded', start, { once: true });
