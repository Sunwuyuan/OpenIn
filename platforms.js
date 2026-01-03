/**
 * OpenInGitHub - 平台配置模块
 *
 * 该模块包含所有支持的代码托管平台和包管理平台的配置信息
 * 以及用于解析和处理仓库信息的工具函数
 */

// ==================== 平台配置 ====================

/**
 * 代码托管平台和包管理平台配置
 * 每个平台包含：
 * - name: 显示名称
 * - keywords: 关键词数组（用于识别）
 * - urlPattern: URL模板
 * - domain: 域名
 * - color: 主题色
 * - icon: 图标emoji
 * - singleName: 是否为单一名称（无需owner/repo格式）
 * - allowAt: 是否支持@符号（用于scoped包）
 */
const PLATFORMS = {
  github: {
    name: 'GitHub',
    keywords: ['github', 'gh'],
    urlPattern: 'https://github.com/{owner}/{repo}{path}',
    domain: 'github.com',
    color: '#24292e',
    icon: '🐙'
  },
  gitlab: {
    name: 'GitLab',
    keywords: ['gitlab', 'gl'],
    urlPattern: 'https://gitlab.com/{owner}/{repo}{path}',
    domain: 'gitlab.com',
    color: '#fc6d26',
    icon: '🦊'
  },
  bitbucket: {
    name: 'Bitbucket',
    keywords: ['bitbucket', 'bb'],
    urlPattern: 'https://bitbucket.org/{owner}/{repo}{path}',
    domain: 'bitbucket.org',
    color: '#0052cc',
    icon: '🪣'
  },
  gitee: {
    name: 'Gitee',
    keywords: ['gitee', 'ge'],
    urlPattern: 'https://gitee.com/{owner}/{repo}{path}',
    domain: 'gitee.com',
    color: '#c71d23',
    icon: '🇨🇳'
  },
  npm: {
    name: 'npm',
    keywords: ['npm', 'npmjs'],
    urlPattern: 'https://www.npmjs.com/package/{owner}{path}',
    domain: 'npmjs.com',
    color: '#cb3837',
    icon: '📦',
    singleName: true,  // npm 包名不需要 owner/repo 格式
    allowAt: true      // 支持 @scope/package 格式
  },
  docker: {
    name: 'Docker Hub',
    keywords: ['docker', 'dockerhub'],
    urlPattern: 'https://hub.docker.com/r/{owner}/{repo}{path}',
    domain: 'hub.docker.com',
    color: '#2496ed',
    icon: '🐳'
  },
  pypi: {
    name: 'PyPI',
    keywords: ['pypi', 'pip', 'python'],
    urlPattern: 'https://pypi.org/project/{owner}{path}',
    domain: 'pypi.org',
    color: '#3775a9',
    icon: '🐍',
    singleName: true,
    allowAt: true
  },
  rubygems: {
    name: 'RubyGems',
    keywords: ['gem', 'rubygems', 'ruby'],
    urlPattern: 'https://rubygems.org/gems/{owner}{path}',
    domain: 'rubygems.org',
    color: '#cc342d',
    icon: '💎',
    singleName: true
  },
  packagist: {
    name: 'Packagist',
    keywords: ['packagist', 'composer', 'php'],
    urlPattern: 'https://packagist.org/packages/{owner}/{repo}{path}',
    domain: 'packagist.org',
    color: '#f28d1a',
    icon: '🎼'
  },
  crates: {
    name: 'crates.io',
    keywords: ['crates', 'cargo', 'rust'],
    urlPattern: 'https://crates.io/crates/{owner}{path}',
    domain: 'crates.io',
    color: '#f74b00',
    icon: '🦀',
    singleName: true
  },
  nuget: {
    name: 'NuGet',
    keywords: ['nuget', 'dotnet', 'csharp'],
    urlPattern: 'https://www.nuget.org/packages/{owner}{path}',
    domain: 'nuget.org',
    color: '#004880',
    icon: '📘',
    singleName: true
  },
  maven: {
    name: 'Maven Central',
    keywords: ['maven', 'mvn', 'java'],
    urlPattern: 'https://search.maven.org/artifact/{owner}/{repo}{path}',
    domain: 'search.maven.org',
    color: '#c71a36',
    icon: '☕'
  },
  zerocat: {
    name: 'ZeroCat',
    keywords: ['zerocat', 'zc'],
    urlPattern: 'https://zerocat.dev/{owner}/{repo}{path}',
    domain: 'zerocat.dev',
    color: '#ff6600',
    icon: '🐱'
  }
};

// ==================== 正则表达式模式 ====================

/**
 * GitHub仓库名格式正则：owner/repo
 * Owner: 1-39字符，字母数字连字符，不能以连字符开头或结尾
 * Repo: 1-100字符，字母数字以及 . - _ 符号
 */
const REPO_PATTERN = /^([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?)\/([\w.-]{1,100})$/;

/**
 * 匹配带路径的仓库格式：owner/repo/path/to/resource
 */
const REPO_WITH_PATH_PATTERN = /^([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?)\/([\w.-]+)(\/.*)?$/;

/**
 * 匹配完整URL：https://github.com/owner/repo 或 github.com/owner/repo
 */
const FULL_URL_PATTERN = /^(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9.-]+)\/([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?)\/([\w.-]+)(\/.*)?$/;

// ==================== 解析函数 ====================

/**
 * 解析输入的仓库字符串
 * @param {string} input - 用户输入
 * @returns {Object|null} - {platform, owner, repo, path} 或 null
 */
function parseRepoInput(input) {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. 检查是否是完整 URL：https://github.com/owner/repo
  let match = trimmed.match(FULL_URL_PATTERN);
  if (match) {
    const [, domain, owner, repo, path = ''] = match;
    const platform = findPlatformByDomain(domain);
    if (platform) {
      return { platform, owner, repo, path };
    }
  }

  // 2. 检查是否带路径：owner/repo/issues/123
  match = trimmed.match(REPO_WITH_PATH_PATTERN);
  if (match) {
    const [, owner, repo, path = ''] = match;
    // 使用全局 DEFAULT_PLATFORM（从 background.js 定义）或默认为 'github'
    const defaultPlatform = (typeof DEFAULT_PLATFORM !== 'undefined') ? DEFAULT_PLATFORM : 'github';
    return { platform: defaultPlatform, owner, repo, path };
  }

  // 3. 基本格式：owner/repo
  match = trimmed.match(REPO_PATTERN);
  if (match) {
    const [, owner, repo] = match;
    // 使用全局 DEFAULT_PLATFORM（从 background.js 定义）或默认为 'github'
    const defaultPlatform = (typeof DEFAULT_PLATFORM !== 'undefined') ? DEFAULT_PLATFORM : 'github';
    return { platform: defaultPlatform, owner, repo, path: '' };
  }

  return null;
}

/**
 * 从搜索查询中提取仓库信息和平台
 * 会自动检测查询中的平台关键词（如"github"、"npm"等）
 *
 * @param {string} query - 搜索查询字符串
 * @returns {Object|null} {platform, owner, repo, path} 或 null
 */
function parseSearchQuery(query) {
  if (!query || typeof query !== 'string') return null;

  const trimmed = query.trim();
  if (!trimmed) return null;

  // 使用空格分隔
  const parts = trimmed.split(/\s+/);
  // 使用全局 DEFAULT_PLATFORM（从 background.js 定义）或默认为 'github'
  const defaultPlatform = (typeof DEFAULT_PLATFORM !== 'undefined') ? DEFAULT_PLATFORM : 'github';
  let detectedPlatform = defaultPlatform;
  let cleanQuery = trimmed;

  // 检查第一项或最后一项是否是平台关键词
  if (parts.length >= 2) {
    const firstPlatform = findPlatformByKeyword(parts[0]);
    const lastPlatform = findPlatformByKeyword(parts[parts.length - 1]);

    if (firstPlatform) {
      // 第一项是平台名，使用该平台
      detectedPlatform = firstPlatform;
      cleanQuery = parts.slice(1).join(' ');
    } else if (lastPlatform) {
      // 最后一项是平台名，使用该平台
      detectedPlatform = lastPlatform;
      cleanQuery = parts.slice(0, -1).join(' ');
    }
    // 如果都不是，使用默认平台，cleanQuery保持不变
  }

  // 解析清理后的查询
  const result = parseRepoInput(cleanQuery);
  if (result) {
    // 如果从查询中检测到平台，覆盖默认平台
    result.platform = detectedPlatform;
    return result;
  }

  return null;
}

// ==================== 工具函数 ====================

/**
 * 根据关键词查找平台
 * @param {string} keyword - 平台关键词（如'gh'、'npm'等）
 * @returns {string|null} 平台key或null
 */
function findPlatformByKeyword(keyword) {
  const lowerKeyword = keyword.toLowerCase();
  for (const [key, config] of Object.entries(PLATFORMS)) {
    if (config.keywords.includes(lowerKeyword)) {
      return key;
    }
  }
  return null;
}

/**
 * 根据域名查找平台
 * @param {string} domain - 域名（如'github.com'）
 * @returns {string|null} 平台key或null
 */
function findPlatformByDomain(domain) {
  const lowerDomain = domain.toLowerCase();
  for (const [key, config] of Object.entries(PLATFORMS)) {
    if (lowerDomain.includes(config.domain) || config.domain.includes(lowerDomain)) {
      return key;
    }
  }
  return null;
}

/**
 * 构建仓库URL
 * 根据平台配置和仓库信息生成完整的URL
 *
 * @param {string} platform - 平台key
 * @param {string} owner - 仓库所有者或包名
 * @param {string} repo - 仓库名（singleName平台可为空）
 * @param {string} path - 路径（可选）
 * @returns {string|null} 完整URL或null
 */
function buildRepoUrl(platform, owner, repo, path = '') {
  const config = PLATFORMS[platform];
  if (!config) {
    return null;
  }

  return config.urlPattern
    .replace('{owner}', owner)
    .replace('{repo}', repo)
    .replace('{path}', path || '');
}

/**
 * 获取平台信息
 * @param {string} platform - 平台key
 * @returns {Object|null} 平台配置对象或null
 */
function getPlatformInfo(platform) {
  return PLATFORMS[platform] || null;
}

// ==================== 导出 ====================
// Service Worker 使用 importScripts 导入，所有变量和函数自动成为全局变量
// 无需显式导出，background.js 可以直接访问所有常量和函数
