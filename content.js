/**
 * OpenInGitHub - Content Script
 *
 * 在代码托管平台页面上显示"返回搜索"提示
 * 当用户从搜索引擎跳转到仓库页面时，显示返回按钮
 */

// ==================== 浏览器兼容层 ====================
const browserAPI = globalThis.browser || globalThis.chrome;

// ==================== 初始化 ====================

// 检查是否由扩展打开且有返回来源
(async () => {
  // 检查功能是否开启（只在autoJump模式下启用Tab返回）
  const result = await browserAPI.storage.sync.get({ searchRedirectMode: 'autoJump' });
  if (result.searchRedirectMode !== 'autoJump') {
    return;
  }

  const tabId = await getTabId();
  if (!tabId) return;

  const sourceResult = await browserAPI.storage.local.get(`repo_source_${tabId}`);
  const sourceData = sourceResult[`repo_source_${tabId}`];

  if (!sourceData) return;

  // 检查时间戳，只显示最近5秒内的返回提示
  const timeDiff = Date.now() - sourceData.timestamp;
  if (timeDiff > 5000) {
    // 清理过期数据
    browserAPI.storage.local.remove(`repo_source_${tabId}`);
    return;
  }

  // 显示返回搜索结果的提示
  showBackToSearchHint(sourceData.url, sourceData.platform);

  // 清理数据，避免重复显示
  browserAPI.storage.local.remove(`repo_source_${tabId}`);
})();

// ==================== 工具函数 ====================

/**
 * 获取当前标签页ID
 * 通过向background script发送消息来获取
 * @returns {Promise<number|null>} 标签页ID或null
 */
async function getTabId() {
  return new Promise((resolve) => {
    browserAPI.runtime.sendMessage({ action: 'getTabId' }, (response) => {
      resolve(response?.tabId);
    });
  });
}

// ==================== UI函数 ====================

/**
 * 显示返回搜索结果的提示UI
 * 在页面右上角显示一个提示条，包含返回按钮和快捷键提示
 *
 * @param {string} sourceUrl - 来源URL（搜索引擎页面）
 * @param {string} platform - 平台名称（用于显示）
 */
function showBackToSearchHint(sourceUrl, platform = 'GitHub') {
  // 创建提示条
  const hint = document.createElement('div');
  hint.id = 'github-jump-back-hint';

  const container = document.createElement('div');
  container.style.cssText = `
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
  `;

  const message = document.createElement('span');
  message.style.flex = '1';
  message.textContent = browserAPI.i18n.getMessage('jumped_from_search', [platform]);

  const backBtn = document.createElement('button');
  backBtn.id = 'back-to-search-btn';
  backBtn.style.cssText = `
    background: rgba(255,255,255,0.2);
    border: 1px solid rgba(255,255,255,0.3);
    color: white;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: all 0.2s;
  `;
  backBtn.textContent = browserAPI.i18n.getMessage('back_to_search');
  backBtn.onmouseover = () => backBtn.style.background = 'rgba(255,255,255,0.3)';
  backBtn.onmouseout = () => backBtn.style.background = 'rgba(255,255,255,0.2)';
  backBtn.addEventListener('click', () => {
    window.location.href = sourceUrl;
  });

  const closeBtn = document.createElement('button');
  closeBtn.id = 'close-hint-btn';
  closeBtn.style.cssText = `
    background: transparent;
    border: none;
    color: white;
    cursor: pointer;
    font-size: 18px;
    padding: 0 4px;
    opacity: 0.7;
    transition: opacity 0.2s;
  `;
  closeBtn.textContent = '✕';
  closeBtn.onmouseover = () => closeBtn.style.opacity = '1';
  closeBtn.onmouseout = () => closeBtn.style.opacity = '0.7';
  closeBtn.addEventListener('click', () => {
    hint.remove();
  });

  container.appendChild(message);
  container.appendChild(backBtn);
  container.appendChild(closeBtn);
  hint.appendChild(container);

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

  // Tab 键快捷返回
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // 检查是否在输入框中
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        return;
      }

      e.preventDefault();
      window.location.href = sourceUrl;
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

