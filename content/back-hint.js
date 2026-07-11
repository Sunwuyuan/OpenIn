/**
 * OpenIn - 仓库页「返回搜索」提示
 */
(async function initBackHint() {
  'use strict';

  const { api, readTimedStorage, clearTimedStorage, toast, getPlatformMeta } = OpenIn;

  const settings = await api.storage.sync.get({ searchRedirectMode: 'autoJump' });
  if (settings.searchRedirectMode !== 'autoJump') return;

  const sourceData = await readTimedStorage('repo_source', 5000);
  if (!sourceData) return;

  const meta = getPlatformMeta(sourceData.platform);
  const platformLabel = meta.name || sourceData.platform || 'GitHub';

  toast.show({
    id: 'openin-back-hint',
    platform: sourceData.platform,
    title: api.i18n.getMessage('jumped_from_search', [platformLabel]),
    actions: [{
      label: api.i18n.getMessage('back_to_search'),
      primary: true,
      dismiss: false,
      onClick: () => {
        window.location.href = sourceData.url;
      }
    }],
    onShortcut: () => {
      window.location.href = sourceData.url;
    },
    shortcut: 'Tab',
    ttl: 10000
  });

  await clearTimedStorage('repo_source');
})();
