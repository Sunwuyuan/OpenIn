/**
 * OpenInGitHub - Search Hint Content Script
 *
 * 在搜索引擎页面上显示"按Tab跳转"提示
 * 仅在Tab跳转模式下激活
 */

// ==================== 初始化 ====================

(async () => {
  // 获取当前标签页ID
  const tabId = await getTabId();
  if (!tabId) return;

  // 检查是否有待跳转的仓库信息
  const result = await chrome.storage.local.get(`search_jump_${tabId}`);
  const jumpData = result[`search_jump_${tabId}`];

  if (!jumpData) return;

  // 检查时间戳，只显示最近3秒内的提示
  const timeDiff = Date.now() - jumpData.timestamp;
  if (timeDiff > 3000) {
    // 清理过期数据
    chrome.storage.local.remove(`search_jump_${tabId}`);
    return;
  }

  // 显示Tab跳转提示
  showTabJumpHint(jumpData);

  // 监听Tab键
  document.addEventListener('keydown', async (e) => {
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // 检查是否在输入框中
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        return;
      }

      e.preventDefault();

      // 重新检查是否还有跳转数据
      const currentResult = await chrome.storage.local.get(`search_jump_${tabId}`);
      const currentJumpData = currentResult[`search_jump_${tabId}`];

      if (currentJumpData) {
        // 清理数据
        chrome.storage.local.remove(`search_jump_${tabId}`);

        // 通知background执行跳转
        chrome.runtime.sendMessage({
          action: 'executeSearchJump',
          data: currentJumpData
        });
      }
    }
  });
})();

// ==================== 工具函数 ====================

/**
 * 获取当前标签页ID
 * @returns {Promise<number|null>}
 */
async function getTabId() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getTabId' }, (response) => {
      resolve(response?.tabId);
    });
  });
}

// ==================== UI函数 ====================

/**
 * 显示Tab跳转提示
 * @param {Object} jumpData - 跳转数据
 */
function showTabJumpHint(jumpData) {
  const { platform, owner, repo, path } = jumpData;

  // 构建显示文本
  const repoText = repo ? `${owner}/${repo}` : owner;
  const platformEmoji = getPlatformEmoji(platform);

  // 创建提示条
  const hint = document.createElement('div');
  hint.id = 'github-tab-jump-hint';
  hint.innerHTML = `
    <div style="
      position: fixed;
      top: 60px;
      right: 20px;
      z-index: 10000;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 12px;
      animation: slideIn 0.3s ease-out;
    ">
      <span style="flex: 1;">
        ${platformEmoji} ${chrome.i18n.getMessage('detected_repo')} <strong>${repoText}</strong>
      </span>
      <span style="
        background: rgba(255,255,255,0.2);
        border: 1px solid rgba(255,255,255,0.3);
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 13px;
        font-weight: 500;
      ">
        ${chrome.i18n.getMessage('press_tab_to_jump')}
      </span>
      <button id="close-tab-hint-btn" style="
        background: transparent;
        border: none;
        color: white;
        cursor: pointer;
        font-size: 18px;
        padding: 0 4px;
        opacity: 0.7;
        transition: opacity 0.2s;
      " onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
        ✕
      </button>
    </div>
  `;

  // 添加动画样式
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(hint);

  // 关闭按钮
  const closeBtn = document.getElementById('close-tab-hint-btn');
  closeBtn.addEventListener('click', async () => {
    hint.remove();
    // 清理跳转数据
    const tabId = await getTabId();
    if (tabId) {
      chrome.storage.local.remove(`search_jump_${tabId}`);
    }
  });

  // 10秒后自动隐藏
  setTimeout(() => {
    if (hint.parentNode) {
      hint.style.transition = 'opacity 0.3s, transform 0.3s';
      hint.style.opacity = '0';
      hint.style.transform = 'translateX(400px)';
      setTimeout(() => hint.remove(), 300);
    }
  }, 10000);
}

/**
 * 获取平台emoji图标
 * @param {string} platform - 平台key
 * @returns {string}
 */
function getPlatformEmoji(platform) {
  const emojis = {
    github: '🐙',
    gitlab: '🦊',
    bitbucket: '🪣',
    gitee: '🇨🇳',
    npm: '📦',
    docker: '🐳',
    pypi: '🐍',
    rubygems: '💎',
    packagist: '🎼',
    crates: '🦀',
    nuget: '📘',
    maven: '☕',
    zerocat: '🐱'
  };
  return emojis[platform] || '📦';
}
