// ==UserScript==
// @name         Meaningful Icons for GitHub
// @description  Replaces GitHub's generic file and folder icons with type-aware Material icons.
// @match        https://github.com/*/*
// ==/UserScript==

/*
Based on Material Icons for GitHub:
https://github.com/material-extensions/material-icons-browser-extension

Icon metadata and SVG assets are loaded from Material Icon Theme 5.38.1:
https://github.com/material-extensions/vscode-material-icon-theme

MIT License

Copyright (c) 2021 Claudio Santos and Richard Lam
Copyright (c) 2021 Philipp Kief (VSCode Material Icon Theme)
Copyright (c) 2025 Material Extensions

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Some upstream glyphs originate from Apache-2.0-licensed Material Design Icons
and Material Symbols. Brand/logo glyphs can have separate copyright or
trademark terms and are not covered by every source library's blanket license.
See:
https://pictogrammers.com/docs/general/license/
https://developers.google.com/fonts/docs/material_icons#licensing
*/

const VERSION = '5.38.1';
const SOURCES = [
  'https://raw.githubusercontent.com/GetOpenScript/GitHub.openscript/main/meaningful-icons',
  `https://cdn.jsdelivr.net/npm/material-icon-theme@${VERSION}`,
];
const MARK = 'data-openscript-meaningful-icon';
// From Material Icons for GitHub's MIT-licensed src/custom/folder-symlink.svg.
const SYMLINK = '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M13.84376 7.53645 12.55627 6.46355A2 2 0 0 0 11.27591 6H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h24a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2H15.12412a2 2 0 0 1-1.28036-.46355Z" fill="#90a4ae"/><path d="M24 13v4h-8v6h8v4l8-7Z" fill="#eceff1"/></svg>';
const ROWS = `.js-navigation-container[role="grid"] > .js-navigation-item,
  file-tree .ActionList-content,
  a.tree-browser-result,
  .PRIVATE_TreeView-item-content,
  .react-directory-filename-column,
  .Box details .Box-row`;
const NAMES = `div[role="rowheader"] > span,
  .ActionList-item-label,
  a.tree-browser-result > marked-text,
  .PRIVATE_TreeView-item-content > .PRIVATE_TreeView-item-content-text,
  .react-directory-filename-column a,
  a.Truncate`;
const ICONS = `.octicon-file,
  .octicon-file-directory-fill,
  .octicon-file-directory-open-fill,
  .octicon-file-submodule,
  .octicon-file-symlink-file,
  .react-directory-filename-column > svg,
  .octicon-package,
  .octicon-file-zip,
  .octicon-file-diff,
  .octicon-file-added,
  .octicon-file-moved,
  .octicon-file-removed`;

const request = async path => {
  let failure;
  for (const source of SOURCES) try {
    const response = await fetch(`${source}/${path}`, { signal: AbortSignal.timeout(10000) });
    if (response.ok) return await response.text();
    failure = new Error(`HTTP ${response.status} loading ${path}`);
  } catch (error) { failure = error; }
  throw failure || new Error(`Could not load ${path}`);
};

const cached = async (key, load) => {
  try {
    const value = await OpenScript.storage.get(key);
    if (value) return value;
  } catch {}
  const value = await load();
  OpenScript.storage.set(key, value).catch(() => {});
  return value;
};

const loadManifest = async () => {
  const key = `material-icon-theme:${VERSION}:manifest`;
  let raw;
  try { raw = await OpenScript.storage.get(key); }
  catch {}
  try { if (raw) return JSON.parse(raw); }
  catch { OpenScript.storage.delete(key).catch(() => {}); }
  raw = await request('dist/material-icons.json');
  const data = JSON.parse(raw);
  OpenScript.storage.set(key, raw).catch(() => {});
  return data;
};

let manifest;
try { manifest = await loadManifest(); }
catch (error) {
  console.warn('[Meaningful Icons] Could not load Material Icon Theme.', error);
  return;
}

const iconLoads = new Map();
const loadIcon = file => {
  if (iconLoads.has(file)) return iconLoads.get(file);
  const source = file === 'folder-symlink.svg' ? Promise.resolve(SYMLINK) : cached(
    `material-icon-theme:${VERSION}:icon:${file}`,
    () => request(`icons/${encodeURIComponent(file)}`),
  );
  const load = source.then(svg => {
    if (!svg.includes('<svg')) throw new Error(`Invalid SVG: ${file}`);
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  });
  iconLoads.set(file, load);
  return load;
};

const lightTheme = () => {
  const mode = document.documentElement.dataset.colorMode;
  return mode === 'light' || mode === 'auto' && matchMedia('(prefers-color-scheme: light)').matches;
};

const getName = row => {
  let name = row.querySelector(NAMES)?.textContent?.replace(/\s+/g, ' ').trim();
  if (!name) return '';
  name = name.split('/').at(-1);
  if (name.includes('@')) name = name.replace(/\s+@\s+[a-f\d]{4,}$/i, '');
  if (row.classList.contains('Box-row') && name.includes('Source code'))
    name = name.replace(/\s+\((.*?)\)$/, '.$1');
  return name;
};

const customIcon = row => {
  const links = [...row.querySelectorAll('a')].map(link => link.getAttribute('href') || '');
  if (links.some(href => /\.github\/workflows\/.*\.ya?ml(?:$|[?#])/i.test(href)))
    return 'github-actions-workflow';
  if (links.some(href => href.endsWith('.github/workflows')) ||
      [...row.querySelectorAll('.PRIVATE_TreeView-item-content-text')].some(el =>
        el.textContent.includes('.github/') && el.textContent.includes('workflows')))
    return 'folder-gh-workflows';
};

const findIcon = (row, icon, name) => {
  const lower = name.toLowerCase();
  const directory = icon.getAttribute('aria-label') === 'Directory' ||
    icon.matches('.octicon-file-directory-fill, .octicon-file-directory-open-fill, .icon-directory') ||
    !!row.querySelector('a[href*="/tree/"]');
  const expanded = directory && icon.classList.contains('octicon-file-directory-open-fill');
  const extensions = [];
  for (let i = -1; (i = lower.indexOf('.', i + 1)) >= 0;) extensions.push(lower.slice(i + 1));

  let id = customIcon(row);
  if (icon.classList.contains('octicon-file-submodule')) id ||= 'folder-git';
  if (icon.classList.contains('octicon-file-symlink-file')) id ||= 'folder-symlink';
  if (!id && directory) id = manifest.folderNames?.[name] || manifest.folderNames?.[lower] || manifest.folder;
  if (!id && !directory) {
    id = manifest.fileNames?.[name] || manifest.fileNames?.[lower];
    for (const ext of extensions)
      if (!id) id = manifest.fileExtensions?.[ext] || manifest.languageIds?.[ext];
    id ||= manifest.file;
  }

  if (lightTheme()) {
    const light = manifest.light || {};
    if (directory) id = light.folderNames?.[name] || light.folderNames?.[lower] || id;
    else {
      let lightId = light.fileNames?.[name] || light.fileNames?.[lower];
      for (const ext of extensions)
        if (!lightId) lightId = light.fileExtensions?.[ext] || light.languageIds?.[ext];
      id = lightId || id;
    }
  }

  if (expanded) {
    const light = lightTheme() ? manifest.light?.folderNamesExpanded : null;
    id = light?.[name] || light?.[lower] || manifest.folderNamesExpanded?.[name] ||
      manifest.folderNamesExpanded?.[lower] || `${id}-open`;
  }

  const fallback = directory ? expanded ? manifest.folderExpanded : manifest.folder : manifest.file;
  const path = (manifest.iconDefinitions?.[id] || manifest.iconDefinitions?.[fallback])?.iconPath;
  const file = id === 'folder-symlink' ? 'folder-symlink.svg' : path?.split('/').at(-1);
  return /^[\w.-]+\.svg$/.test(file || '') ? file : '';
};

const applyIcon = async row => {
  const icon = row.querySelector(ICONS);
  if (!icon || icon.hasAttribute(MARK)) return;
  const name = getName(row);
  const file = name && findIcon(row, icon, name);
  if (!file) return;

  icon.setAttribute(MARK, 'loading');
  try {
    const url = await loadIcon(file);
    if (!icon.isConnected || getName(row) !== name) return icon.removeAttribute(MARK);
    icon.innerHTML = '';
    Object.assign(icon.style, {
      backgroundImage: `url("${url}")`,
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundSize: 'contain',
      display: '',
    });
    icon.setAttribute(MARK, file);
  } catch (error) {
    icon.removeAttribute(MARK);
    console.warn(`[Meaningful Icons] Could not load ${file}.`, error);
  }
};

let timer;
const run = () => {
  clearTimeout(timer);
  timer = setTimeout(() => document.querySelectorAll(ROWS).forEach(applyIcon), 40);
};
const repaint = () => {
  document.querySelectorAll(`[${MARK}]`).forEach(icon => icon.removeAttribute(MARK));
  run();
};

new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
new MutationObserver(repaint).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-color-mode', 'data-light-theme', 'data-dark-theme'],
});
matchMedia('(prefers-color-scheme: light)').addEventListener('change', repaint);
['turbo:load', 'turbo:render', 'pjax:end', 'popstate'].forEach(event =>
  window.addEventListener(event, run)
);
run();
