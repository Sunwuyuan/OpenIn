/**
 * OpenIn - Content Script 共享核心
 */
(function initOpenInCore(global) {
  'use strict';

  const OpenIn = global.OpenIn || {};
  global.OpenIn = OpenIn;

  const browserAPI = global.browser || global.chrome;
  OpenIn.api = browserAPI;

  let tabIdCache = null;

  OpenIn.getTabId = function getTabId() {
    if (tabIdCache) {
      return Promise.resolve(tabIdCache);
    }

    return new Promise((resolve) => {
      browserAPI.runtime.sendMessage({ action: 'getTabId' }, (response) => {
        tabIdCache = response?.tabId ?? null;
        resolve(tabIdCache);
      });
    });
  };

  OpenIn.readTimedStorage = async function readTimedStorage(storageKey, maxAgeMs) {
    const tabId = await OpenIn.getTabId();
    if (!tabId) return null;

    const key = `${storageKey}_${tabId}`;
    const result = await browserAPI.storage.local.get(key);
    const data = result[key];
    if (!data) return null;

    if (Date.now() - data.timestamp > maxAgeMs) {
      await browserAPI.storage.local.remove(key);
      return null;
    }

    return data;
  };

  OpenIn.clearTimedStorage = async function clearTimedStorage(storageKey) {
    const tabId = await OpenIn.getTabId();
    if (!tabId) return;
    await browserAPI.storage.local.remove(`${storageKey}_${tabId}`);
  };

  OpenIn.isTypingContext = function isTypingContext() {
    const el = document.activeElement;
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  };

  OpenIn.onTabKey = function onTabKey(handler) {
    const listener = (event) => {
      if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }
      if (OpenIn.isTypingContext()) return;
      event.preventDefault();
      handler(event);
    };

    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  };

  OpenIn.PLATFORM_META = {
    github: { abbr: 'GH', color: '#58a6ff', name: 'GitHub' },
    gitlab: { abbr: 'GL', color: '#fc6d26', name: 'GitLab' },
    bitbucket: { abbr: 'BB', color: '#2684ff', name: 'Bitbucket' },
    gitee: { abbr: 'GE', color: '#c71d23', name: 'Gitee' },
    npm: { abbr: 'NP', color: '#cb3837', name: 'npm' },
    docker: { abbr: 'DK', color: '#2496ed', name: 'Docker Hub' },
    pypi: { abbr: 'PY', color: '#3775a9', name: 'PyPI' },
    rubygems: { abbr: 'RB', color: '#e9573f', name: 'RubyGems' },
    packagist: { abbr: 'PK', color: '#f28d1a', name: 'Packagist' },
    crates: { abbr: 'CR', color: '#f74b00', name: 'crates.io' },
    nuget: { abbr: 'NU', color: '#004880', name: 'NuGet' },
    maven: { abbr: 'MV', color: '#c71a36', name: 'Maven' },
    zerocat: { abbr: 'ZC', color: '#ff6600', name: 'ZeroCat' }
  };

  OpenIn.getPlatformMeta = function getPlatformMeta(platformKey) {
    return OpenIn.PLATFORM_META[platformKey] || {
      abbr: 'OI',
      color: '#8b9cb3',
      name: platformKey || 'OpenIn'
    };
  };
})(globalThis);
