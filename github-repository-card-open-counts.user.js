// ==UserScript==
// @name         GitHub Repository Card Open Counts
// @namespace    https://github.com/Microck
// @version      1.4.0
// @description  Add open issue and pull request counts to GitHub repository cards.
// @match        https://github.com/*
// @match        https://www.github.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_deleteValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @connect      api.github.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

// Configure the optional token from Tampermonkey's menu on any GitHub page:
// GitHub Repository Card Open Counts -> Set GitHub API token.

(function () {
  'use strict';

  const CACHE_TTL_MS = 10 * 60 * 1000;
  const MAX_CONCURRENT_REQUESTS = 4;
  const CACHE_PREFIX = 'github-repository-card-open-counts:';
  const TOKEN_KEY = 'github-api-token';
  const CARD_SELECTOR = 'li, article, [role="listitem"], .repo-list-item, .Box-row';
  const OPEN_COUNT_ATTRIBUTE = 'data-github-open-count';
  const OPEN_COUNT_SELECTOR = `[${OPEN_COUNT_ATTRIBUTE}]`;
  const CREATED_ROW_ATTRIBUTE = 'data-github-open-count-row';
  const READY_ATTRIBUTE = 'data-github-open-counts-ready';
  const COUNT_TYPES = {
    issues: {
      key: 'issues',
      path: 'issues',
      noun: 'issues',
      iconClass: 'octicon-issue-opened',
      iconPath: 'M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z',
    },
    pulls: {
      key: 'pulls',
      path: 'pulls',
      noun: 'pull requests',
      iconClass: 'octicon-git-pull-request',
      iconPath: 'M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z',
    },
  };

  const cache = new Map();
  const inFlight = new Map();
  const requestQueue = [];
  const githubToken = getGitHubToken();
  let activeRequests = 0;
  let scanTimer;
  let pendingScanRoots = new Set();

  registerTokenMenu();
  addStyles();
  scheduleScan([document]);

  const observer = new MutationObserver(handleMutations);
  observer.observe(document.body, { childList: true, subtree: true });

  function registerTokenMenu() {
    GM_registerMenuCommand(
      githubToken ? 'Replace GitHub API token' : 'Set GitHub API token',
      saveGitHubToken,
    );
    GM_registerMenuCommand('Clear stored GitHub API token', clearGitHubToken);
  }

  function saveGitHubToken() {
    const token = window.prompt(
      'Paste a GitHub token. It will be stored in Tampermonkey and sent only to api.github.com.',
    );
    if (token === null) return;

    const trimmedToken = token.trim();
    if (!trimmedToken) {
      window.alert('No token was saved. Use the clear command to remove an existing token.');
      return;
    }

    GM_setValue(TOKEN_KEY, trimmedToken);
    clearCachedCounts();
    window.location.reload();
  }

  function clearGitHubToken() {
    GM_deleteValue(TOKEN_KEY);
    clearCachedCounts();
    window.location.reload();
  }

  function getGitHubToken() {
    const token = GM_getValue(TOKEN_KEY, '');
    return typeof token === 'string' ? token.trim() : '';
  }

  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .github-open-count {
        display: inline-block;
        margin-left: 10px;
        white-space: nowrap;
      }

      .github-open-count + .github-open-count {
        margin-left: 8px;
      }

      .github-open-count--pending {
        opacity: 0.65;
      }
    `;
    document.head.appendChild(style);
  }

  function handleMutations(records) {
    const roots = new Set();

    for (const record of records) {
      if (record.target.nodeType === 1 && record.target.closest(OPEN_COUNT_SELECTOR)) {
        continue;
      }

      for (const node of record.addedNodes) {
        if (node.nodeType === 1 && !node.matches(OPEN_COUNT_SELECTOR)) {
          roots.add(node);
        }
      }
    }

    if (roots.size) scheduleScan(roots);
  }

  function scheduleScan(roots) {
    for (const root of roots) pendingScanRoots.add(root);

    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => {
      const rootsToScan = coalesceScanRoots(pendingScanRoots);
      pendingScanRoots = new Set();
      scanCards(rootsToScan);
    }, 100);
  }

  function coalesceScanRoots(roots) {
    const connectedRoots = [...roots].filter((root) => root === document || root.isConnected);
    return connectedRoots.filter((root) => (
      !connectedRoots.some((otherRoot) => otherRoot !== root && otherRoot.contains(root))
    ));
  }

  function scanCards(roots) {
    const cards = new Set();
    const repositories = new Map();

    for (const root of roots) {
      const links = [];
      if (root.nodeType === 1 && root.matches('a[href]')) links.push(root);
      root.querySelectorAll('a[href]').forEach((link) => links.push(link));

      for (const repositoryLink of links) {
        const repository = getRepositoryFromLink(repositoryLink);
        const card = repositoryLink.closest(CARD_SELECTOR);
        if (!repository || !card || card.hasAttribute(READY_ATTRIBUTE)) continue;

        cards.add(card);
        repositories.set(card, repository);
      }
    }

    for (const card of cards) {
      const cardInfo = getCardInfo(card, repositories.get(card));
      if (cardInfo) attachCounts(card, cardInfo);
    }
  }

  function getCardInfo(card, repository) {
    const nativeLinks = new Map();
    const generatedLinks = new Map();
    let fallbackStatsRow = null;

    for (const link of card.querySelectorAll('a[href]')) {
      const countType = getOpenCountType(link);
      if (countType) {
        const sourceLinks = link.hasAttribute(OPEN_COUNT_ATTRIBUTE) ? generatedLinks : nativeLinks;
        if (!sourceLinks.has(countType.key)) {
          sourceLinks.set(countType.key, link);
        } else if (sourceLinks === generatedLinks) {
          link.remove();
        }
        continue;
      }

      if (!fallbackStatsRow && isRepositoryStatLink(link)) {
        fallbackStatsRow = link.parentElement;
      }
    }

    const links = {};

    for (const countType of Object.values(COUNT_TYPES)) {
      const nativeLink = nativeLinks.get(countType.key);
      const generatedLink = generatedLinks.get(countType.key);
      links[countType.key] = nativeLink || generatedLink || null;

      if (nativeLink && generatedLink) generatedLink.remove();
    }

    const existingLink = Object.values(links).find(Boolean);
    const statsRow = existingLink?.parentElement || fallbackStatsRow || getPinnedStatsRow(card);

    if (!repository || !statsRow || statsRow === card) return null;

    return { links, repository, statsRow };
  }

  function getPinnedStatsRow(card) {
    if (!card.matches('.pinned-item-list-item')) return null;

    const content = card.querySelector('.pinned-item-list-item-content');
    if (!content) return null;

    const existingRow = content.querySelector('p.mb-0.mt-2.f6.color-fg-muted');
    if (existingRow) return existingRow;

    const statsRow = document.createElement('p');
    statsRow.className = 'mb-0 mt-2 f6 color-fg-muted';
    statsRow.setAttribute(CREATED_ROW_ATTRIBUTE, 'true');
    content.append(statsRow);
    return statsRow;
  }

  function isRepositoryStatLink(link) {
    const parts = getPathParts(link);
    if (!parts) return false;

    return (parts.length === 3 && ['stargazers', 'forks'].includes(parts[2]))
      || (parts.length === 4 && parts[2] === 'network' && parts[3] === 'members');
  }

  function getOpenCountType(link) {
    const parts = getPathParts(link);
    if (!parts || parts.length !== 3) return null;

    return Object.values(COUNT_TYPES).find((countType) => (
      parts[2] === countType.path
      && (link.hasAttribute(OPEN_COUNT_ATTRIBUTE) || link.querySelector(`.${countType.iconClass}`))
    )) || null;
  }

  function getRepositoryFromLink(link) {
    const parts = getPathParts(link);
    if (!parts || parts.length !== 2) return null;

    return {
      owner: parts[0],
      repo: parts[1],
      fullName: parts.join('/'),
    };
  }

  function getPathParts(link) {
    const href = link.getAttribute('href');
    if (!href) return null;

    try {
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return null;
      return url.pathname.split('/').filter(Boolean);
    } catch {
      return null;
    }
  }

  function attachCounts(card, { links, repository, statsRow }) {
    const originalNativeLinks = new Map();

    for (const countType of Object.values(COUNT_TYPES)) {
      let link = links[countType.key];

      if (link) {
        if (!link.hasAttribute(OPEN_COUNT_ATTRIBUTE)) {
          originalNativeLinks.set(countType.key, saveNativeLinkState(link));
        }
        prepareCountLink(link, countType);
      } else {
        link = createCountLink(repository, countType);
        statsRow.append(link);
        links[countType.key] = link;
      }
    }

    card.setAttribute(READY_ATTRIBUTE, 'true');

    getCounts(repository)
      .then((counts) => {
        if (!card.isConnected) return;

        updateCountLink(links[COUNT_TYPES.issues.key], COUNT_TYPES.issues, counts.openIssues);
        updateCountLink(links[COUNT_TYPES.pulls.key], COUNT_TYPES.pulls, counts.openPulls);
      })
      .catch(() => {
        for (const countType of Object.values(COUNT_TYPES)) {
          const link = links[countType.key];
          if (originalNativeLinks.has(countType.key)) {
            restoreNativeLinkState(link, originalNativeLinks.get(countType.key));
          } else {
            link.remove();
          }
        }
        if (statsRow.hasAttribute(CREATED_ROW_ATTRIBUTE)) statsRow.remove();
        card.removeAttribute(READY_ATTRIBUTE);
      });
  }

  function createCountLink(repository, countType) {
    const link = document.createElement('a');
    link.className = 'pinned-item-meta Link--muted github-open-count';
    link.href = `/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/${countType.path}`;
    prepareCountLink(link, countType);
    return link;
  }

  function prepareCountLink(link, countType) {
    link.setAttribute(OPEN_COUNT_ATTRIBUTE, countType.key);
    link.classList.add('github-open-count--pending');
    renderCountLink(link, countType, ' …', `Loading open ${countType.noun}`);
  }

  function renderCountLink(link, countType, text, title) {
    const icon = link.querySelector('svg') || createOcticon(countType);
    link.replaceChildren(icon, document.createTextNode(text));
    link.title = title;
    link.setAttribute('aria-label', link.title);
  }

  function createOcticon(countType) {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('data-component', 'Octicon');
    icon.setAttribute('data-view-component', 'true');
    icon.setAttribute('height', '16');
    icon.setAttribute('viewBox', '0 0 16 16');
    icon.setAttribute('version', '1.1');
    icon.setAttribute('width', '16');
    icon.setAttribute('fill', 'currentColor');
    icon.classList.add('octicon', countType.iconClass);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', countType.iconPath);
    icon.append(path);
    return icon;
  }

  function updateCountLink(link, countType, count) {
    if (!link?.isConnected) return;

    const formattedCount = formatCount(count);
    link.classList.remove('github-open-count--pending');
    renderCountLink(link, countType, ` ${formattedCount}`, `${formattedCount} open ${countType.noun}`);
  }

  function saveNativeLinkState(link) {
    return {
      html: link.innerHTML,
      title: link.getAttribute('title'),
      ariaLabel: link.getAttribute('aria-label'),
    };
  }

  function restoreNativeLinkState(link, state) {
    if (!state) return;

    link.innerHTML = state.html;
    link.classList.remove('github-open-count--pending');
    link.removeAttribute(OPEN_COUNT_ATTRIBUTE);
    restoreAttribute(link, 'title', state.title);
    restoreAttribute(link, 'aria-label', state.ariaLabel);
  }

  function restoreAttribute(element, name, value) {
    if (value === null) {
      element.removeAttribute(name);
    } else {
      element.setAttribute(name, value);
    }
  }

  function formatCount(count) {
    return Number(count).toLocaleString();
  }

  function getCounts(repository) {
    const key = repository.fullName.toLowerCase();
    if (inFlight.has(key)) return inFlight.get(key);

    const memoryCached = cache.get(key);

    if (memoryCached && Date.now() - memoryCached.fetchedAt < CACHE_TTL_MS) {
      return Promise.resolve(memoryCached.counts);
    }

    const storedCached = readCache(key);
    if (storedCached && Date.now() - storedCached.fetchedAt < CACHE_TTL_MS) {
      cache.set(key, storedCached);
      return Promise.resolve(storedCached.counts);
    }

    const request = fetchCounts(repository)
      .then((counts) => {
        const record = { fetchedAt: Date.now(), counts };
        cache.set(key, record);
        writeCache(key, record);
        return counts;
      })
      .finally(() => inFlight.delete(key));

    inFlight.set(key, request);
    return request;
  }

  async function fetchCounts(repository) {
    const apiBase = `https://api.github.com/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`;
    const [repositoryResponse, pullResponse] = await Promise.all([
      requestJson(apiBase),
      requestJson(`${apiBase}/pulls?state=open&per_page=1`),
    ]);
    const openPulls = getCollectionTotal(pullResponse);
    const combinedOpenCount = Math.max(0, Number(repositoryResponse.data.open_issues_count) || 0);

    return {
      // GitHub treats pull requests as issues, so remove them for an issue-only total.
      openIssues: repositoryResponse.data.has_issues === false
        ? 0
        : Math.max(0, combinedOpenCount - openPulls),
      openPulls,
    };
  }

  function getCollectionTotal(response) {
    const lastPage = /<[^>]*[?&]page=(\d+)[^>]*>\s*;\s*rel="last"/i.exec(
      getResponseHeader(response.headers, 'link') || '',
    );

    if (lastPage) return Number(lastPage[1]);
    return response.data.length;
  }

  function requestJson(url) {
    return new Promise((resolve, reject) => {
      requestQueue.push({ url, resolve, reject });
      pumpRequestQueue();
    });
  }

  function pumpRequestQueue() {
    while (activeRequests < MAX_CONCURRENT_REQUESTS && requestQueue.length) {
      const request = requestQueue.shift();
      activeRequests += 1;
      const headers = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      };
      if (githubToken) headers.Authorization = `Bearer ${githubToken}`;

      GM_xmlhttpRequest({
        method: 'GET',
        url: request.url,
        headers,
        timeout: 15000,
        onload(response) {
          finishRequest(() => {
            if (response.status < 200 || response.status >= 300) {
              request.reject(new Error(`GitHub API returned HTTP ${response.status}`));
            } else {
              try {
                request.resolve({ data: JSON.parse(response.responseText), headers: response.responseHeaders });
              } catch {
                request.reject(new Error('GitHub API returned invalid JSON'));
              }
            }
          });
        },
        onerror() {
          finishRequest(() => request.reject(new Error('GitHub API request failed')));
        },
        ontimeout() {
          finishRequest(() => request.reject(new Error('GitHub API request timed out')));
        },
      });
    }
  }

  function finishRequest(handleResult) {
    activeRequests -= 1;
    handleResult();
    pumpRequestQueue();
  }

  function getResponseHeader(headers, name) {
    const expected = `${name.toLowerCase()}:`;
    const line = String(headers || '')
      .split(/\r?\n/)
      .find((header) => header.toLowerCase().startsWith(expected));
    return line ? line.slice(expected.length).trim() : null;
  }

  function readCache(key) {
    try {
      const raw = sessionStorage.getItem(`${CACHE_PREFIX}${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeCache(key, record) {
    try {
      sessionStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(record));
    } catch {
      // Storage can be unavailable in private browsing or when quota is exhausted.
    }
  }

  function clearCachedCounts() {
    try {
      for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = sessionStorage.key(index);
        if (key?.startsWith(CACHE_PREFIX)) sessionStorage.removeItem(key);
      }
    } catch {
      // Storage can be unavailable in private browsing.
    }
  }
})();
