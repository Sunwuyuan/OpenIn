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

// 获取版本号
function getVersion() {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  return manifest.version;
}

// 主函数
async function build() {
  const version = getVersion();
  const distDir = 'dist';
  const zipName = `openin-chrome-v${version}.zip`;

  console.log(`\n📦 打包 v${version}\n`);

  // 创建 dist 目录
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  fs.mkdirSync(distDir);

  // 创建 ZIP
  const output = fs.createWriteStream(path.join(distDir, zipName));
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', () => {
    const size = (archive.pointer() / 1024).toFixed(2);
    console.log(`✅ 完成: dist/${zipName} (${size} KB)\n`);
  });

  archive.on('error', (err) => {
    throw err;
  });

  archive.pipe(output);

  // 添加文件，排除指定目录
  archive.glob('**/*', {
    ignore: EXCLUDE.map(e => `**/${e}/**`).concat(EXCLUDE)
  });

  await archive.finalize();
}

build();
