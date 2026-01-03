// ==================== 导入平台配置 ====================
// Service Worker 使用 importScripts 导入外部脚本
importScripts('platforms.js');

// 默认平台（可在设置页面配置），初始为 GitHub
let DEFAULT_PLATFORM = 'github';

// 默认的常见地址列表（不会被重定向）
const DEFAULT_BYPASS_PATTERNS = [
  'localhost'
];

// ==================== 配置管理函数 ====================

/**
 * 获取用户配置的白名单模式
 * @returns {Promise<string[]>} 白名单数组
 */
async function getBypassPatterns() {
  const result = await chrome.storage.sync.get({
    customBypassPatterns: []
  });
  return [...DEFAULT_BYPASS_PATTERNS, ...result.customBypassPatterns];
}

/**
 * 获取功能开关配置
 * @returns {Promise<Object>} 功能开关对象
 */
async function getFeatureToggles() {
  const result = await chrome.storage.sync.get({
    featureOmnibox: true,
    featureSearchRedirect: true,
    featureDnsIntercept: true,
    searchRedirectMode: 'autoJump'
  });
  return result;
}

/**
 * 从存储加载默认平台配置
 */
function loadDefaultPlatform() {
  chrome.storage.sync.get({ defaultPlatform: 'github' }, (result) => {
    const value = result.defaultPlatform;
    if (PLATFORMS[value]) {
      DEFAULT_PLATFORM = value;
      log('加载默认平台:', value);
      updateDefaultSuggestion();
    }
  });
}

/**
 * 动态更新omnibox默认提示
 */
function updateDefaultSuggestion() {
  const defaultCfg = PLATFORMS[DEFAULT_PLATFORM] || PLATFORMS.github;
  chrome.omnibox.setDefaultSuggestion({
    description: `${defaultCfg.name}: <match>${chrome.i18n.getMessage('omnibox_default_suggestion')}</match>`
  });
}

/**
 * 统一的仓库打开核心处理函数
 * 用于所有场景：Omnibox输入、搜索引擎拦截、DNS错误拦截
 * @param {Object} params - 参数对象
 * @param {string} params.platform - 平台key (github, gitlab等)
 * @param {string} params.owner - 仓库所有者或包名
 * @param {string} params.repo - 仓库名（对于singleName平台可为空）
 * @param {string} params.path - 路径（可选）
 * @param {number} params.tabId - 标签页ID（可选，用于当前标签页打开）
 * @param {string} params.sourceUrl - 来源URL（可选，用于记录返回）
 * @param {string} params.disposition - 打开方式（可选，优先级高于配置）
 * @param {string} params.searchRedirectMode - 搜索跳转模式（可选）
 * @returns {Promise<string|null>} 返回打开的URL，失败返回null
 */
async function openRepoUnified(params) {
  const { platform, owner, repo, path = '', tabId, sourceUrl, disposition, searchRedirectMode } = params;

  // 验证参数
  if (!platform || !owner) {
    log('参数不完整:', params);
    return null;
  }

  // 构建URL
  const repoUrl = buildRepoUrl(platform, owner, repo, path);
  if (!repoUrl) {
    log('无法构建 URL，平台:', platform);
    return null;
  }

  const platformInfo = PLATFORMS[platform];
  log('========== 统一打开处理 ==========');
  log('平台:', platformInfo.name, platformInfo.icon);
  log('目标:', `${owner}${repo ? '/' + repo : ''}${path}`);
  log('URL:', repoUrl);

  // 确定打开方式
  let finalDisposition = disposition;
  if (!finalDisposition) {
    // 根据searchRedirectMode决定打开方式
    if (searchRedirectMode === 'newTab') {
      finalDisposition = 'newForegroundTab';
    } else {
      // autoJump 和 tabJump 模式都使用当前标签页
      finalDisposition = 'currentTab';
    }
  }

  log('打开方式:', finalDisposition);

  // 执行打开操作
  if (finalDisposition === 'currentTab' && tabId) {
    // 当前标签页打开，记录来源以便返回（仅在autoJump模式下）
    if (sourceUrl && searchRedirectMode === 'autoJump') {
      await chrome.storage.local.set({
        [`repo_source_${tabId}`]: {
          url: sourceUrl,
          platform: platformInfo.name,
          timestamp: Date.now()
        }
      });
    }
    chrome.tabs.update(tabId, { url: repoUrl });
  } else if (finalDisposition === 'newBackgroundTab') {
    // 后台新标签页打开
    chrome.tabs.create({ url: repoUrl, active: false });
  } else {
    // 前台新标签页打开（默认）
    chrome.tabs.create({ url: repoUrl });
  }

  log('====================================');
  return repoUrl;
}

/**
 * 检查URL是否应该绕过（不进行重定向）
 * @param {string} url - 待检查的URL
 * @param {string[]} bypassPatterns - 白名单模式数组
 * @returns {boolean} 是否应该绕过
 */
function shouldBypass(url, bypassPatterns) {
  const urlLower = url.toLowerCase();

  for (const pattern of bypassPatterns) {
    if (urlLower.includes(pattern.toLowerCase())) {
      return true;
    }
  }

  return false;
}

// ==================== 调试配置 ====================
const DEBUG = true;

/**
 * 统一的日志输出函数
 * @param {...any} args - 日志内容
 */
function log(...args) {
  if (DEBUG) console.log('[OpenInGitHub]', ...args);
}

// ==================== 搜索引擎检测函数 ====================

/**
 * 从URL提取搜索关键词（支持任意搜索引擎）
 * @param {string} url - 搜索引擎URL
 * @returns {string|null} 搜索关键词或null
 */
function extractSearchQuery(url) {
  try {
    const urlObj = new URL(url);

    // 常见搜索参数列表（按优先级排序）
    const searchParams = [
      'q',           // Google, Bing, DuckDuckGo, Yahoo
      'query',       // 自定义搜索引擎
      'search',      // 通用搜索参数
      'wd',          // Baidu
      'word',        // Baidu备用
      'text',        // Yandex
      's',           // WordPress等
      'search_query', // YouTube
      'k',           // 其他搜索引擎
      'keywords',    // 其他搜索引擎
      'qt',          // 其他搜索引擎
      'p'            // Yahoo Japan
    ];

    // 尝试所有可能的搜索参数
    for (const param of searchParams) {
      const value = urlObj.searchParams.get(param);
      if (value && value.trim()) {
        log('从参数', param, '提取到搜索关键词:', value);
        return value;
      }
    }

    return null;
  } catch (e) {
    return null;
  }
}

/**
 * 检查URL是否可能是搜索引擎
 * @param {string} url - 待检查的URL
 * @returns {boolean} 是否为搜索引擎
 */
function isPossibleSearchEngine(url) {
  try {
    const urlObj = new URL(url);

    // 排除代码托管平台和本地地址
    const excludePatterns = [
      'github.com',
      'gitlab.com',
      'bitbucket.org',
      'gitee.com',
      'localhost',
      '127.0.0.1',
      '192.168.',
      '10.0.',
      '172.16.'
    ];

    for (const pattern of excludePatterns) {
      if (urlObj.hostname.includes(pattern)) {
        return false;
      }
    }

    // 检查URL是否包含常见的搜索参数
    const searchParams = ['q', 'query', 'search', 'wd', 'word', 'text', 's', 'search_query', 'k', 'keywords', 'qt', 'p'];
    const hasSearchParam = searchParams.some(param => urlObj.searchParams.has(param));

    if (hasSearchParam) {
      log('检测到可能的搜索引擎 URL:', urlObj.hostname);
      return true;
    }

    return false;
  } catch (e) {
    return false;
  }
}

// ==================== 跳转记录管理 ====================
// 用于避免返回时重复跳转
const recentJumps = new Map(); // key: 'platform:owner/repo', value: timestamp

/**
 * 检查是否为最近的跳转（5秒内）
 * @param {string} platform - 平台key
 * @param {string} owner - 所有者
 * @param {string} repo - 仓库名
 * @returns {boolean} 是否为最近跳转
 */
function isRecentJump(platform, owner, repo) {
  const key = `${platform}:${owner}/${repo}`;
  const lastJump = recentJumps.get(key);

  if (!lastJump) return false;

  // 5秒内的跳转视为最近跳转
  const timeDiff = Date.now() - lastJump;
  if (timeDiff < 5000) {
    log('最近刚跳转过:', key, '跳过以避免循环');
    return true;
  }

  // 清理过期记录
  recentJumps.delete(key);
  return false;
}

/**
 * 记录一次跳转操作
 * @param {string} platform - 平台key
 * @param {string} owner - 所有者
 * @param {string} repo - 仓库名
 */
function recordJump(platform, owner, repo) {
  const key = `${platform}:${owner}/${repo}`;
  recentJumps.set(key, Date.now());

  // 清理超过10秒的旧记录
  setTimeout(() => {
    const timestamp = recentJumps.get(key);
    if (timestamp && Date.now() - timestamp >= 10000) {
      recentJumps.delete(key);
    }
  }, 10000);
}

// ==================== 事件监听器 ====================

/**
 * 监听导航事件 - 拦截搜索引擎搜索
 * 当用户在搜索引擎搜索仓库名时，自动跳转到对应平台
 */
chrome.webNavigation.onBeforeNavigate.addListener(
  async (details) => {
    // 只处理主框架
    if (details.frameId !== 0) {
      return;
    }

    try {
      // 检查功能是否开启
      const features = await getFeatureToggles();
      if (!features.featureSearchRedirect) {
        return;
      }

      log('导航到:', details.url);

      // 检查是否可能是搜索引擎
      if (!isPossibleSearchEngine(details.url)) {
        return;
      }

      // 提取搜索关键词
      const searchQuery = extractSearchQuery(details.url);
      if (!searchQuery) {
        log('未找到搜索关键词');
        return;
      }

      log('搜索关键词:', searchQuery);

      // 解析搜索查询（支持平台关键词）
      const parsed = parseSearchQuery(searchQuery);

      if (parsed) {
        const { platform, owner, repo, path } = parsed;

        log('从搜索引擎匹配到仓库:', `${platform}:${owner}/${repo}${path}`);

        // 检查是否是最近刚跳转过的（避免返回后再次跳转）
        if (isRecentJump(platform, owner, repo)) {
          return;
        }

        // 检查搜索跳转模式
        if (features.searchRedirectMode === 'tabJump') {
          // Tab跳转模式：存储跳转信息，不立即跳转
          await chrome.storage.local.set({
            [`search_jump_${details.tabId}`]: {
              platform,
              owner,
              repo,
              path,
              timestamp: Date.now()
            }
          });
          log('Tab跳转模式：已存储跳转信息，等待用户按Tab');
          return;
        }

        // 自动跳转模式：记录并立即跳转
        recordJump(platform, owner, repo);

        // 使用统一的打开处理函数
        await openRepoUnified({
          platform,
          owner,
          repo,
          path,
          tabId: details.tabId,
          sourceUrl: details.url,
          searchRedirectMode: features.searchRedirectMode
        });
      }
    } catch (e) {
      log('处理搜索错误:', e);
    }
  }
);

// 尝试在 DNS 查询之前拦截（可能因权限不足而失败）
try {
  chrome.webRequest.onBeforeRequest.addListener(
    async (details) => {
      // 只处理主框架请求
      if (details.type !== 'main_frame') {
        return;
      }

      try {
        log('尝试拦截请求:', details.url);
        const url = new URL(details.url);

        // 如果已经是 github.com，跳过
        if (url.hostname === 'github.com' || url.hostname === 'www.github.com') {
          return;
        }

        // 获取白名单
        const bypassPatterns = await getBypassPatterns();
        if (shouldBypass(details.url, bypassPatterns)) {
          return;
        }

        // 提取可能的仓库名
        const fullPath = (url.hostname + url.pathname).replace(/^\//, '').replace(/\/$/, '');
        const repoMatch = fullPath.match(REPO_PATTERN);

        if (repoMatch) {
          const owner = repoMatch[1];
          const repo = repoMatch[2];
          const githubUrl = `https://github.com/${owner}/${repo}`;

          log('webRequest 拦截成功，重定向到:', githubUrl);
          return { redirectUrl: githubUrl };
        }
      } catch (e) {
        log('webRequest 处理错误:', e);
      }
    },
    { urls: ['<all_urls>'] },
    ['blocking']
  );
  log('webRequest 拦截器注册成功');
} catch (e) {
  log('webRequest 拦截器注册失败（正常，因为 Manifest V3 限制）:', e.message);
}

/**
 * 监听DNS错误事件 - 拦截域名解析失败
 * 当用户在地址栏输入仓库名（如 owner/repo）导致DNS失败时，跳转到对应平台
 */
chrome.webNavigation.onErrorOccurred.addListener(
  async (details) => {
    // 只处理主框架
    if (details.frameId !== 0) {
      return;
    }

    // 只处理 DNS 错误
    if (details.error !== 'net::ERR_NAME_NOT_RESOLVED') {
      return;
    }

    try {
      // 检查功能是否开启
      const features = await getFeatureToggles();
      if (!features.featureDnsIntercept) {
        return;
      }

      log('DNS 查询失败:', details.url);
      const url = new URL(details.url);

      // 检查是否是已知的代码托管平台
      const platform = findPlatformByDomain(url.hostname);
      if (platform) {
        log('已经是', PLATFORMS[platform].name, '跳过');
        return;
      }

      // 获取白名单
      const bypassPatterns = await getBypassPatterns();
      if (shouldBypass(details.url, bypassPatterns)) {
        log('在白名单中，跳过');
        return;
      }

      // 提取可能的仓库名（支持各种格式）
      const fullPath = (url.hostname + url.pathname).replace(/^\//, '').replace(/\/$/, '');
      log('检查完整路径:', fullPath);

      const parsed = parseRepoInput(fullPath);

      if (parsed) {
        const { platform, owner, repo, path } = parsed;

        log('从DNS错误检测到仓库:', `${platform}:${owner}/${repo}${path}`);

        // 检查是否是最近刚跳转过的（避免返回后再次跳转）
        if (isRecentJump(platform, owner, repo)) {
          return;
        }

        // 记录本次跳转
        recordJump(platform, owner, repo);

        // 使用统一的打开处理函数
        await openRepoUnified({
          platform,
          owner,
          repo,
          path,
          tabId: details.tabId,
          sourceUrl: details.url,
          searchRedirectMode: 'autoJump' // DNS拦截默认使用autoJump模式
        });
      }
    } catch (e) {
      log('DNS 错误处理失败:', e);
    }
  }
);

// ==================== 生命周期事件 ====================

/**
 * 监听插件安装或更新事件
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // 首次安装，初始化存储
    chrome.storage.sync.set({
      customBypassPatterns: [],
      defaultPlatform: 'github', // 默认平台 GitHub
      featureOmnibox: true, // Omnibox功能默认开启
      featureSearchRedirect: true, // 搜索引擎跳转默认开启
      featureDnsIntercept: true, // DNS错误拦截默认开启
      searchRedirectMode: 'autoJump' // 搜索跳转模式默认为自动跳转
    });

    // 打开选项页面
    chrome.runtime.openOptionsPage();
  }

  // 无论是安装还是更新，启动时都加载一次默认平台
  loadDefaultPlatform();
});

/**
 * 监听存储变化 - 响应用户配置更新
 */
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.defaultPlatform) {
    const value = changes.defaultPlatform.newValue;
    if (PLATFORMS[value]) {
      DEFAULT_PLATFORM = value;
      log('默认平台已更新为:', value);
      updateDefaultSuggestion();
    }
  }
});

// ==================== Omnibox API ====================
// 地址栏关键词触发（输入 'open' + 空格）

// 初始默认提示（会在加载默认平台后动态更新）
/**
 * Omnibox输入变化处理 - 提供搜索建议
 */
updateDefaultSuggestion();

chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  const trimmedText = text.trim();

  if (!trimmedText) {
    // 重置为默认建议
    updateDefaultSuggestion();

    const items = [];

    // 1. 第一项：按当前默认平台生成的实际打开项（纯“平台: 文本”格式）
    const defaultCfg = PLATFORMS[DEFAULT_PLATFORM] || PLATFORMS.github;
    const sampleName = 'microsoft/vscode';
    items.push({
      content: sampleName,
      description: `${defaultCfg.name}: <match>${sampleName}</match>`
    });

    // 2. 第二项：同样模式的示例，保持“平台: 文本”格式
    items.push({
      content: 'facebook/react',
      description: `${defaultCfg.name}: <match>facebook/react</match>`
    });

    // 3. 额外示例（仍然正常行为，不是提示语）
    items.push({
      content: 'https://gitlab.com/owner/repo',
      description: 'GitLab: <match>https://gitlab.com/owner/repo</match>'
    });

    // 4. 最后一项：单独的“使用提示/文档”项
    items.push({
      content: 'https://docs.wuyuan.dev',
      description: '📖 使用提示与更多示例：<match>docs.wuyuan.dev</match>'
    });

    suggest(items);
    return;
  }

  const suggestions = [];
  let detectedPlatform = null;
  let inputName = trimmedText;

  // 单词输入（无空格无 /）时，先看看是不是在“搜平台”
  if (!trimmedText.includes(' ') && !trimmedText.includes('/')) {
    const lower = trimmedText.toLowerCase();

    // 用关键字前缀匹配平台，如 git → GitHub / GitLab，doc → Docker
    const matchedPlatforms = Object.entries(PLATFORMS)
      .filter(([key, cfg]) => cfg.keywords.some(kw => kw.startsWith(lower)));

    if (matchedPlatforms.length > 0) {
      // 默认平台（github）优先，其余在下方
      matchedPlatforms.sort(([aKey], [bKey]) => {
        if (aKey === DEFAULT_PLATFORM) return -1;
        if (bKey === DEFAULT_PLATFORM) return 1;
        return 0;
      });

      matchedPlatforms.forEach(([key, cfg], index) => {
        const url = `https://${cfg.domain}/`;
        suggestions.push({
          content: trimmedText,
          description: `${cfg.icon} ${cfg.name}: 打开 <match>${url}</match>`
        });
      });

      suggest(suggestions);
      return;
    }
  }

  // 1. 检查是否是完整 URL
  const urlMatch = trimmedText.match(FULL_URL_PATTERN);
  if (urlMatch) {
    const [, domain, owner, repo, path = ''] = urlMatch;
    const platform = findPlatformByDomain(domain);
    if (platform) {
      const platformInfo = PLATFORMS[platform];
      const url = buildRepoUrl(platform, owner, repo, path);

      // 动态更新默认建议
      chrome.omnibox.setDefaultSuggestion({
        description: `${platformInfo.name}: <match>${owner}/${repo}</match>${path}`
      });

      suggestions.push({
        content: trimmedText,
        description: `${platformInfo.icon} ${platformInfo.name}: <match>${owner}/${repo}</match>${path} - ${url}`
      });
      suggest(suggestions);
      return;
    }
  }

  // 2. 检查是否包含空格（平台名 + 仓库名）
  const parts = trimmedText.split(/\s+/);
  if (parts.length === 2) {
    // 尝试识别平台关键词
    const [part1, part2] = parts;
    const platform1 = findPlatformByKeyword(part1);
    const platform2 = findPlatformByKeyword(part2);

    if (platform1) {
      // 第一部分是平台名: "npm react"
      detectedPlatform = platform1;
      inputName = part2;
    } else if (platform2) {
      // 第二部分是平台名: "react npm"
      detectedPlatform = platform2;
      inputName = part1;
    }
  }

  // 3. 如果指定了平台，只显示该平台
  if (detectedPlatform) {
    const platformInfo = PLATFORMS[detectedPlatform];
    const isSingleName = platformInfo.singleName;

    if (isSingleName) {
      // 单一包名平台 - 动态更新默认建议
      chrome.omnibox.setDefaultSuggestion({
        description: `${platformInfo.name}: <match>${inputName}</match>`
      });

      const url = buildRepoUrl(detectedPlatform, inputName, '', '');
      suggestions.push({
        content: trimmedText,
        description: `${platformInfo.icon} ${platformInfo.name}: <match>${inputName}</match> - ${url}`
      });
    } else {
      // 需要 owner/repo 格式
      const repoMatch = inputName.match(REPO_WITH_PATH_PATTERN) || inputName.match(REPO_PATTERN);
      if (repoMatch) {
        const owner = repoMatch[1];
        const repo = repoMatch[2];
        const path = repoMatch[3] || '';

        // 动态更新默认建议
        chrome.omnibox.setDefaultSuggestion({
          description: `${platformInfo.name}: <match>${owner}/${repo}</match>${path}`
        });

        const url = buildRepoUrl(detectedPlatform, owner, repo, path);
        suggestions.push({
          content: trimmedText,
          description: `${platformInfo.icon} ${platformInfo.name}: <match>${owner}/${repo}</match>${path} - ${url}`
        });
      } else {
        // 没有 / 符号，当作用户名处理
        chrome.omnibox.setDefaultSuggestion({
          description: `${platformInfo.name}: <match>${inputName}</match>`
        });

        const url = `https://${platformInfo.domain}/${inputName}`;
        suggestions.push({
          content: trimmedText,
          description: `${platformInfo.icon} ${platformInfo.name}: <match>${inputName}</match> - ${url}`
        });
      }
    }
    suggest(suggestions);
    return;
  }

  // 4. 没有指定平台，提供多个平台选项
  // 检查是否是仓库格式或单一包名
  const repoMatch = inputName.match(REPO_WITH_PATH_PATTERN) || inputName.match(REPO_PATTERN);

  if (repoMatch) {
    // owner/repo 格式 - 提供代码托管平台选项
    const owner = repoMatch[1];
    const repo = repoMatch[2];
    const path = repoMatch[3] || '';

    // 动态更新默认建议为默认平台
    const defaultCfg = PLATFORMS[DEFAULT_PLATFORM] || PLATFORMS.github;
    chrome.omnibox.setDefaultSuggestion({
      description: `${defaultCfg.name}: <match>${owner}/${repo}</match>${path}`
    });

    // 主要代码托管平台
    const codePlatforms = ['github', 'gitlab', 'bitbucket', 'gitee'];
    codePlatforms.forEach(platformKey => {
      const platformInfo = PLATFORMS[platformKey];
      const url = buildRepoUrl(platformKey, owner, repo, path);
      suggestions.push({
        content: `${inputName} ${platformInfo.keywords[0]}`,
        description: `${platformInfo.icon} ${platformInfo.name}: <match>${owner}/${repo}</match>${path}`
      });
    });

    // Docker Hub 也支持 owner/repo 格式
    const dockerInfo = PLATFORMS['docker'];
    const dockerUrl = buildRepoUrl('docker', owner, repo, path);
    suggestions.push({
      content: `${inputName} docker`,
      description: `${dockerInfo.icon} ${dockerInfo.name}: <match>${owner}/${repo}</match>`
    });
  } else {
    // 单一名称：优先按“用户/组织名”给出代码托管平台，再给包管理平台
    const lower = inputName.toLowerCase();
    const hasAt = inputName.includes('@');
    // 动态更新默认建议为默认平台的用户页
    const defaultCfg = PLATFORMS[DEFAULT_PLATFORM] || PLATFORMS.github;
    chrome.omnibox.setDefaultSuggestion({
      description: `${defaultCfg.name}: <match>${inputName}</match>`
    });
    // 代码托管平台用户页：github.com/name, gitlab.com/name ...
    const codePlatforms = ['github', 'gitlab', 'bitbucket', 'gitee'];
    codePlatforms.forEach((platformKey, index) => {
      const cfg = PLATFORMS[platformKey];
      const url = `https://${cfg.domain}/${inputName}`;
      suggestions.push({
        content: index === 0 ? inputName : `${inputName} ${cfg.keywords[0]}`,
        description: `${cfg.icon} ${cfg.name}: <match>${inputName}</match> - ${url}`
      });
    });

    // 平台关键词本身（如 github、gitlab、docker、npm）不再当作包名
    const isPlatformWord = Object.values(PLATFORMS).some(cfg => cfg.keywords.includes(lower));

    if (!isPlatformWord) {
      const packagePlatforms = ['npm', 'pypi', 'rubygems', 'crates', 'nuget'];
      packagePlatforms.forEach(platformKey => {
        const cfg = PLATFORMS[platformKey];
        if (hasAt && !cfg.allowAt) return; // 含 @ 时只保留支持 @ 的平台
        const url = buildRepoUrl(platformKey, inputName, '', '');
        suggestions.push({
          content: `${inputName} ${cfg.keywords[0]}`,
          description: `${cfg.icon} ${cfg.name}: <match>${inputName}</match> - ${url}`
        });
      });
    }
  }

  // 如果没有任何建议，显示帮助信息
  if (suggestions.length === 0) {
    suggestions.push({
      content: 'microsoft/vscode',
      description: '💡 示例格式: <match>owner/repo</match> 或 <match>包名 平台名</match>'
    });
  }

/**
 * Omnibox输入确认处理 - 执行跳转
 */
  suggest(suggestions);
});

chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  // 检查功能是否开启
  const features = await getFeatureToggles();
  if (!features.featureOmnibox) {
    return;
  }

  const trimmedText = text.trim();
  if (!trimmedText) return;

  let platform = DEFAULT_PLATFORM;
  let inputName = trimmedText;
  let owner = '';
  let repo = '';
  let path = '';

  // 1. 完整 URL：直接识别平台并按仓库路径打开
  const urlMatch = trimmedText.match(FULL_URL_PATTERN);
  if (urlMatch) {
    const [, domain, ownerMatch, repoMatch, pathMatch = ''] = urlMatch;
    const detectedPlatform = findPlatformByDomain(domain);
    if (detectedPlatform) {
      platform = detectedPlatform;
      owner = ownerMatch;
      repo = repoMatch;
      path = pathMatch;
    }
  } else {
    const hasSlash = trimmedText.includes('/');
    const hasSpace = /\s/.test(trimmedText);

    // 2. 如果是单词（无空格无 /）：
    if (!hasSlash && !hasSpace) {
      const lower = trimmedText.toLowerCase();

      // 2.1 先看是否像是在“搜平台”（git → GitHub/GitLab，doc → Docker等）
      const matchedPlatforms = Object.entries(PLATFORMS)
        .filter(([key, cfg]) => cfg.keywords.some(kw => kw.startsWith(lower)));

      if (matchedPlatforms.length > 0) {
        // 打开对应平台首页，默认平台优先
        matchedPlatforms.sort(([aKey], [bKey]) => {
          if (aKey === DEFAULT_PLATFORM) return -1;
          if (bKey === DEFAULT_PLATFORM) return 1;
          return 0;
        });

        const [firstKey, firstCfg] = matchedPlatforms[0];
        const url = `https://${firstCfg.domain}/`;
        platform = firstKey;
        openUrl(url, disposition);
        return;
      }

      // 2.2 否则视为“用户/组织名”：github.com/name, gitlab.com/name ...
      const defaultCfg = PLATFORMS[DEFAULT_PLATFORM];
      const url = `https://${defaultCfg.domain}/${trimmedText}`;
      platform = DEFAULT_PLATFORM;
      openUrl(url, disposition);
      return;
    }

    // 3. 包含空格：前后部分中优先把前一个当平台，其次后一个
    const parts = trimmedText.split(/\s+/);
    if (parts.length >= 2) {
      const [first, ...rest] = parts;
      const last = rest[rest.length - 1];
      const firstPlatform = findPlatformByKeyword(first);
      const lastPlatform = findPlatformByKeyword(last);

      if (firstPlatform) {
        platform = firstPlatform;
        inputName = rest.join(' ');
      } else if (lastPlatform) {
        platform = lastPlatform;
        inputName = parts.slice(0, -1).join(' ');
      }
    }

    const platformInfo = PLATFORMS[platform];

    // 4. singleName 平台：整个 inputName 当作包名
    if (platformInfo.singleName) {
      owner = inputName;
      repo = '';
      path = '';
    } else {
      // 5. 代码托管平台：有 / 当仓库；无 / 当用户
      if (inputName.includes('/')) {
        const m = inputName.match(REPO_WITH_PATH_PATTERN) || inputName.match(REPO_PATTERN);
        if (m) {
          owner = m[1];
          repo = m[2];
          path = m[3] || '';
        }
      } else {
        // 无 /：用户页
        const cfg = PLATFORMS[platform];
        const url = `https://${cfg.domain}/${inputName}`;
        openUrl(url, disposition);
        return;
      }
    }
  }

  // 6. 构建 URL 并打开仓库/包页面
  const repoUrl = buildRepoUrl(platform, owner, repo, path);
  if (repoUrl) {
    const platformInfo = PLATFORMS[platform];
    log('Omnibox 触发，跳转到:', platformInfo.name, repoUrl);
    openUrl(repoUrl, disposition);
  }
});

/**
 * 根据disposition打开URL（用于Omnibox）
 * @param {string} url - 目标URL
 * @param {string} disposition - 打开方式
 */
function openUrl(url, disposition) {
  log('Omnibox 打开URL:', url, '方式:', disposition);

  if (disposition === 'currentTab') {
    chrome.tabs.update({ url });
  } else if (disposition === 'newForegroundTab') {
    chrome.tabs.create({ url });
  } else {
    // newBackgroundTab
    chrome.tabs.create({ url, active: false });
  }
}

/**
 * 监听来自content script的消息
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTabId') {
    sendResponse({ tabId: sender.tab?.id });
  } else if (request.action === 'executeSearchJump') {
    // 执行Tab跳转模式下的仓库跳转
    const { platform, owner, repo, path } = request.data;

    // 记录跳转（避免返回时重复跳转）
    recordJump(platform, owner, repo);

    // 执行跳转
    openRepoUnified({
      platform,
      owner,
      repo,
      path,
      tabId: sender.tab?.id
    });

    sendResponse({ success: true });
  }
  return true;
});

/**
 * 监听扩展图标点击事件 - 打开设置页面
 */
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});
