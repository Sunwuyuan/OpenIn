/**
 * OpenIn - 搜索引擎页「按 Tab 跳转」提示
 */
(async function initSearchHint() {
  'use strict';

  const { api, readTimedStorage, clearTimedStorage, toast } = OpenIn;

  const jumpData = await readTimedStorage('search_jump', 3000);
  if (!jumpData) return;

  const { platform, owner, repo } = jumpData;
  const repoText = repo ? `${owner}/${repo}` : owner;

  toast.show({
    id: 'openin-search-hint',
    platform,
    title: api.i18n.getMessage('source_search'),
    highlight: repoText,
    shortcut: 'Tab',
    onShortcut: async () => {
      const current = await readTimedStorage('search_jump', 3000);
      if (!current) return;

      await clearTimedStorage('search_jump');
      api.runtime.sendMessage({
        action: 'executeSearchJump',
        data: current
      });
    },
    onClose: () => {
      clearTimedStorage('search_jump');
    },
    ttl: 10000
  });
})();
