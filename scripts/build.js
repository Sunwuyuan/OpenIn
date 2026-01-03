#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// 排除的目录和文件
const EXCLUDE = [
  'node_modules',
  'dist',
  'scripts',
  '.git',
  '.gitignore',
  'package.json',
  'package-lock.json',
  'BUILD_SYSTEM.md',
  'QUICKSTART.md',
  'TRANSLATION.md',
  'README.md'
];

// 获取版本号（从 package.json）
function getVersion() {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  return pkg.version;
}

// 同步版本号到 manifest.json
function syncVersionToManifest(version) {
  const manifestPath = 'manifest.json';
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.version = version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`📝 版本号已同步到 manifest.json: ${version}`);
}

// 主函数
async function build() {
  const version = getVersion();

  // 同步版本号到 manifest.json
  syncVersionToManifest(version);
  const distDir = 'dist';

  console.log(`\n📦 打包 v${version}\n`);

  // 创建 dist 目录
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  fs.mkdirSync(distDir);

  // 构建 Chrome 版本
  await buildForBrowser('chrome', version, distDir);

  // 构建 Firefox 版本
  await buildForBrowser('firefox', version, distDir);
}

async function buildForBrowser(browser, version, distDir) {
  const zipName = `openin-${browser}-v${version}.zip`;

  console.log(`📦 打包 ${browser} 版本...`);

  // 创建临时目录
  const tempDir = path.join(distDir, `temp-${browser}`);
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });

  // 复制所有文件到临时目录
  const filesToCopy = fs.readdirSync('.');
  for (const file of filesToCopy) {
    if (EXCLUDE.includes(file)) continue;

    const srcPath = path.join('.', file);
    const destPath = path.join(tempDir, file);

    if (fs.statSync(srcPath).isDirectory()) {
      fs.cpSync(srcPath, destPath, { recursive: true });
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }

  // 为 Firefox 修改 manifest.json
  if (browser === 'firefox') {
    const manifestPath = path.join(tempDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // Firefox 使用 scripts 而不是 service_worker
    manifest.background = {
      scripts: ['background.js']
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // 合并 platforms.js 到 background.js（Firefox 不支持 importScripts）
    const backgroundPath = path.join(tempDir, 'background.js');
    const platformsPath = path.join(tempDir, 'platforms.js');

    let backgroundContent = fs.readFileSync(backgroundPath, 'utf8');
    const platformsContent = fs.readFileSync(platformsPath, 'utf8');

    // 移除 importScripts 行，并在前面插入 platforms.js 内容
    backgroundContent = backgroundContent.replace(
      /\/\/ ==================== 导入平台配置 ====================[\s\S]*?importScripts\('platforms\.js'\);/,
      `// ==================== 平台配置（已内联） ====================\n${platformsContent}`
    );

    fs.writeFileSync(backgroundPath, backgroundContent);
  }

  // 创建 ZIP
  const output = fs.createWriteStream(path.join(distDir, zipName));
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on('close', () => {
      const size = (archive.pointer() / 1024).toFixed(2);
      console.log(`✅ ${browser}: dist/${zipName} (${size} KB)`);

      // 清理临时目录
      fs.rmSync(tempDir, { recursive: true, force: true });
      resolve();
    });

    archive.on('error', (err) => {
      fs.rmSync(tempDir, { recursive: true, force: true });
      reject(err);
    });

    archive.pipe(output);

    // 从临时目录添加文件
    archive.directory(tempDir, false);

    archive.finalize();
  });
}

build();
