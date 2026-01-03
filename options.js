// ==================== 浏览器兼容层 ====================
const browserAPI = globalThis.browser || globalThis.chrome;

// 默认的常见地址列表（与 background.js 保持一致）
const DEFAULT_BYPASS_PATTERNS = [
  'localhost'
];

// DOM 元素
const patternInput = document.getElementById('patternInput');
const addBtn = document.getElementById('addBtn');
const customPatternsList = document.getElementById('customPatternsList');
const defaultPatternsList = document.getElementById('defaultPatternsList');
const messageDiv = document.getElementById('message');
const defaultPlatformSelect = document.getElementById('defaultPlatform');

// 功能开关 DOM 元素
const featureOmnibox = document.getElementById('featureOmnibox');
const featureSearchRedirect = document.getElementById('featureSearchRedirect');
const featureDnsIntercept = document.getElementById('featureDnsIntercept');
const searchRedirectOptions = document.getElementById('searchRedirectOptions');
const searchModeAutoJump = document.getElementById('searchModeAutoJump');
const searchModeTabJump = document.getElementById('searchModeTabJump');
const searchModeNewTab = document.getElementById('searchModeNewTab');

// 高级设置元素
const advancedToggle = document.getElementById('advancedToggle');
const advancedContent = document.getElementById('advancedContent');

// 可选的默认平台列表（需与 background.js 中的代码托管平台保持一致）
const AVAILABLE_DEFAULT_PLATFORMS = ['github', 'gitlab', 'bitbucket', 'gitee'];

// 加载默认平台配置
async function loadDefaultPlatform() {
  const result = await browserAPI.storage.sync.get({
    defaultPlatform: 'github'
  });

  const value = result.defaultPlatform;
  defaultPlatformSelect.value = AVAILABLE_DEFAULT_PLATFORMS.includes(value) ? value : 'github';
}

// 国际化处理
function localizeHtml() {
  // 翻译带有 data-i18n 属性的元素
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const message = browserAPI.i18n.getMessage(el.getAttribute('data-i18n'));
    if (message) {
      el.textContent = message;
    }
  });

  // 翻译带有 data-i18n-placeholder 属性的元素
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const message = browserAPI.i18n.getMessage(el.getAttribute('data-i18n-placeholder'));
    if (message) {
      el.placeholder = message;
    }
  });
}

// 保存默认平台配置
async function saveDefaultPlatform() {
  const value = defaultPlatformSelect.value;
  await browserAPI.storage.sync.set({ defaultPlatform: value });
  showMessage(browserAPI.i18n.getMessage('saved_success'), 'success');
}

// 显示消息
function showMessage(text, type = 'success') {
  messageDiv.textContent = text;
  messageDiv.className = `message ${type}`;
  messageDiv.style.display = 'block';

  setTimeout(() => {
    messageDiv.style.display = 'none';
  }, 3000);
}

// 加载并显示自定义白名单
async function loadCustomPatterns() {
  const result = await browserAPI.storage.sync.get({
    customBypassPatterns: []
  });

  const patterns = result.customBypassPatterns;

  if (patterns.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-state';
    emptyDiv.textContent = browserAPI.i18n.getMessage('no_custom_rules');
    customPatternsList.innerHTML = '';
    customPatternsList.appendChild(emptyDiv);
  } else {
    customPatternsList.innerHTML = '';
    patterns.forEach((pattern, index) => {
      const li = document.createElement('li');
      li.className = 'pattern-item';

      const span = document.createElement('span');
      span.className = 'pattern-text';
      span.textContent = pattern;

      const btn = document.createElement('button');
      btn.className = 'delete-btn';
      btn.dataset.index = index;
      btn.textContent = browserAPI.i18n.getMessage('delete');
      btn.addEventListener('click', async (e) => {
        const idx = parseInt(e.target.dataset.index);
        await deletePattern(idx);
      });

      li.appendChild(span);
      li.appendChild(btn);
      customPatternsList.appendChild(li);
    });
  }
}

// 显示默认白名单
function loadDefaultPatterns() {
  defaultPatternsList.innerHTML = '';
  DEFAULT_BYPASS_PATTERNS.forEach(pattern => {
    const li = document.createElement('li');
    li.textContent = pattern;
    defaultPatternsList.appendChild(li);
  });
}

// 添加新的白名单规则
async function addPattern() {
  const pattern = patternInput.value.trim();

  if (!pattern) {
    showMessage(browserAPI.i18n.getMessage('enter_pattern_error'), 'error');
    return;
  }

  // 获取当前的自定义白名单
  const result = await browserAPI.storage.sync.get({
    customBypassPatterns: []
  });

  const patterns = result.customBypassPatterns;

  // 检查是否已存在
  if (patterns.includes(pattern)) {
    showMessage('该规则已存在', 'error');
    return;
  }

  // 添加新规则
  patterns.push(pattern);

  // 保存到存储
  await browserAPI.storage.sync.set({
    customBypassPatterns: patterns
  });

  // 清空输入框
  patternInput.value = '';

  // 重新加载列表
  await loadCustomPatterns();

  showMessage('规则添加成功！', 'success');
}

// 删除白名单规则
async function deletePattern(index) {
  const result = await browserAPI.storage.sync.get({
    customBypassPatterns: []
  });

  const patterns = result.customBypassPatterns;
  patterns.splice(index, 1);

  await browserAPI.storage.sync.set({
    customBypassPatterns: patterns
  });

  await loadCustomPatterns();

  showMessage('规则已删除', 'success');
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 事件监听
addBtn.addEventListener('click', addPattern);

patternInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    addPattern();
  }
});

// 监听默认平台变化
defaultPlatformSelect.addEventListener('change', saveDefaultPlatform);

// ==================== 功能开关管理 ====================

// 加载功能开关配置
async function loadFeatureToggles() {
  const result = await browserAPI.storage.sync.get({
    featureOmnibox: true,
    featureSearchRedirect: true,
    featureDnsIntercept: true,
    searchRedirectMode: 'autoJump'
  });

  featureOmnibox.checked = result.featureOmnibox;
  featureSearchRedirect.checked = result.featureSearchRedirect;
  featureDnsIntercept.checked = result.featureDnsIntercept;

  if (result.searchRedirectMode === 'autoJump') {
    searchModeAutoJump.checked = true;
  } else if (result.searchRedirectMode === 'tabJump') {
    searchModeTabJump.checked = true;
  } else {
    searchModeNewTab.checked = true;
  }

  updateSearchRedirectOptionsUI();
}

// 保存功能开关配置
async function saveFeatureToggles() {
  await browserAPI.storage.sync.set({
    featureOmnibox: featureOmnibox.checked,
    featureSearchRedirect: featureSearchRedirect.checked,
    featureDnsIntercept: featureDnsIntercept.checked
  });
  showMessage(browserAPI.i18n.getMessage('saved_success'), 'success');
}

// 保存搜索跳转模式
async function saveSearchRedirectMode() {
  let mode = 'autoJump';
  if (searchModeAutoJump.checked) {
    mode = 'autoJump';
  } else if (searchModeTabJump.checked) {
    mode = 'tabJump';
  } else if (searchModeNewTab.checked) {
    mode = 'newTab';
  }

  await browserAPI.storage.sync.set({
    searchRedirectMode: mode
  });
  showMessage(browserAPI.i18n.getMessage('saved_success'), 'success');
}

// 更新搜索跳转选项 UI 状态
function updateSearchRedirectOptionsUI() {
  if (featureSearchRedirect.checked) {
    searchRedirectOptions.classList.remove('sub-option-disabled');
  } else {
    searchRedirectOptions.classList.add('sub-option-disabled');
  }
}

// 监听功能开关变化
featureOmnibox.addEventListener('change', saveFeatureToggles);
featureDnsIntercept.addEventListener('change', saveFeatureToggles);

featureSearchRedirect.addEventListener('change', () => {
  saveFeatureToggles();
  updateSearchRedirectOptionsUI();
});

// 监听搜索跳转模式变化
searchModeAutoJump.addEventListener('change', saveSearchRedirectMode);
searchModeTabJump.addEventListener('change', saveSearchRedirectMode);
searchModeNewTab.addEventListener('change', saveSearchRedirectMode);

// ==================== 高级设置折叠 ====================

// 监听高级设置折叠按钮
advancedToggle.addEventListener('click', () => {
  const isCollapsed = advancedContent.classList.contains('collapsed');

  if (isCollapsed) {
    advancedContent.classList.remove('collapsed');
    advancedToggle.querySelector('.advanced-toggle').classList.remove('collapsed');
  } else {
    advancedContent.classList.add('collapsed');
    advancedToggle.querySelector('.advanced-toggle').classList.add('collapsed');
  }
});

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
  localizeHtml();
  loadDefaultPatterns();
  loadCustomPatterns();
  loadDefaultPlatform();
  loadFeatureToggles();
});

