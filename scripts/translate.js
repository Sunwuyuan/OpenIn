#!/usr/bin/env node

/**
 * 增量翻译脚本 - OpenIn 插件
 *
 * 功能:
 * 1. 检测中文（基础语言）的变化（新增、修改、删除）
 * 2. 自动将变化同步到所有已存在的语言
 * 3. 使用缓存文件追踪状态
 *
 * 用法:
 *   node scripts/translate.js --target <LANG>  # 翻译单个语言
 *   node scripts/translate.js --sync            # 同步所有语言
 *
 * 环境变量:
 *   OPENAI_API_URL    - AI API地址
 *   OPENAI_API_KEY    - API密钥
 *   OPENAI_MODEL      - 模型名称 (默认: gpt-4)
 */

const fs = require('fs');
const path = require('path');

// 常量定义
const SOURCE_LOCALE = 'zh_CN';
const LOCALES_DIR = path.join(__dirname, '..', '_locales');
const CACHE_FILE = path.join(__dirname, 'translation-cache.json');

const LANGUAGES = {
    ar: "阿拉伯语",
    am: "阿姆哈拉语",
    bg: "保加利亚语",
    bn: "孟加拉语",
    ca: "加泰罗尼亚语",
    cs: "捷克语",
    da: "丹麦语",
    de: "德语",
    el: "希腊语",
    en: "英语",
    en_AU: "英语（澳大利亚）",
    en_GB: "英语（英国）",
    en_US: "英语（美国）",
    es: "西班牙语",
    es_419: "西班牙语（拉丁美洲和加勒比地区）",
    et: "爱沙尼亚语",
    fa: "波斯语",
    fi: "芬兰语",
    fil: "菲律宾语",
    fr: "法语",
    gu: "古吉拉特语",
    he: "希伯来语",
    hi: "印地语",
    hr: "克罗地亚语",
    hu: "匈牙利语",
    id: "印度尼西亚语",
    it: "意大利语",
    ja: "日语",
    kn: "卡纳达语",
    ko: "韩语",
    lt: "立陶宛语",
    lv: "拉脱维亚语",
    ml: "马拉雅拉姆语",
    mr: "马拉地语",
    ms: "马来语",
    nl: "荷兰语",
    no: "挪威语",
    pl: "波兰语",
    pt_BR: "葡萄牙语（巴西）",
    pt_PT: "葡萄牙语（葡萄牙）",
    ro: "罗马尼亚语",
    ru: "俄语",
    sk: "斯洛伐克语",
    sl: "斯洛文尼亚语",
    sr: "塞尔维亚语",
    sv: "瑞典语",
    sw: "斯瓦希里语",
    ta: "泰米尔语",
    te: "泰卢固语",
    th: "泰语",
    tr: "土耳其语",
    uk: "乌克兰语",
    vi: "越南语",
    zh_CN: "中文（中国）",
    zh_TW: "中文（台湾）"
};

// 简单参数解析
function parseArgs() {
    const args = {};
    for (let i = 2; i < process.argv.length; i++) {
        if (process.argv[i].startsWith('--')) {
            const key = process.argv[i].slice(2);
            const value = process.argv[i + 1];
            if (!value || value.startsWith('--')) {
                args[key] = true;
            } else {
                args[key] = value;
                i++;
            }
        }
    }
    return args;
}

// 读取缓存
function loadCache() {
    if (fs.existsSync(CACHE_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        } catch (error) {
            console.warn('⚠️  缓存文件损坏，将重新创建');
            return {};
        }
    }
    return {};
}

// 保存缓存
function saveCache(cache) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

// 获取消息的纯文本映射
function getMessageTexts(messages) {
    const texts = {};
    for (const [key, value] of Object.entries(messages)) {
        texts[key] = value.message;
    }
    return texts;
}

// 检测变化
function detectChanges(oldTexts, newTexts) {
    const added = {};
    const modified = {};
    const deleted = {};

    // 检测新增和修改
    for (const [key, text] of Object.entries(newTexts)) {
        if (!oldTexts[key]) {
            added[key] = text;
        } else if (oldTexts[key] !== text) {
            modified[key] = text;
        }
    }

    // 检测删除
    for (const key of Object.keys(oldTexts)) {
        if (!newTexts[key]) {
            deleted[key] = oldTexts[key];
        }
    }

    return { added, modified, deleted };
}

// 获取已存在的语言
function getExistingLanguages() {
    const languages = [];
    if (!fs.existsSync(LOCALES_DIR)) return languages;

    const dirs = fs.readdirSync(LOCALES_DIR);
    for (const dir of dirs) {
        const dirPath = path.join(LOCALES_DIR, dir);
        const messagesPath = path.join(dirPath, 'messages.json');
        if (fs.statSync(dirPath).isDirectory() && fs.existsSync(messagesPath) && dir !== SOURCE_LOCALE) {
            languages.push(dir);
        }
    }
    return languages;
}

// 调用 AI 翻译
async function translateTexts(texts, targetLang, apiUrl, apiKey, model) {
    const textCount = Object.keys(texts).length;
    console.log(`     📤 发送 ${textCount} 条消息到 AI...`);

    const prompt = `You are a professional translator. Translate the following Chrome extension messages from Chinese to ${LANGUAGES[targetLang]}.

Rules:
1. Maintain JSON structure exactly
2. Do NOT translate key names, keep them unchanged
3. Keep technical terms consistent (GitHub, npm, Docker, ChatGPT, etc.)
4. Preserve emoji characters and formatting
5. Return ONLY valid JSON, no markdown or explanation

Messages to translate:
${JSON.stringify(texts, null, 2)}

Respond with JSON object only:`;

    console.log(`     🔗 API: ${apiUrl.replace(/https?:\/\/([^\/]+).*/, 'https://$1/...')}`);
    console.log(`     🤖 模型: ${model}`);

    const startTime = Date.now();
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 4000
        })
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`\n     ❌ API 错误 (耗时: ${elapsed}s):`);
        console.error(`        状态码: ${response.status} ${response.statusText}`);
        console.error(`        响应: ${errorText.slice(0, 300)}`);
        throw new Error(`API 请求失败 (${response.status})`);
    }

    // 检查响应类型
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error(`\n     ❌ 非 JSON 响应 (耗时: ${elapsed}s):`);
        console.error(`        Content-Type: ${contentType || '未知'}`);
        console.error(`        响应: ${text.slice(0, 300)}`);
        throw new Error('API 返回HTML而非JSON（检查API地址是否正确）');
    }

    let result;
    try {
        result = await response.json();
    } catch (jsonError) {
        console.error(`\n     ❌ JSON 解析失败 (耗时: ${elapsed}s)`);
        throw new Error('无法解析 API 响应');
    }

    console.log(`     📥 收到响应 (耗时: ${elapsed}s)`);

    const translatedText = result.choices?.[0]?.message?.content;
    if (!translatedText) {
        console.error(`\n     ❌ 响应结构异常:`);
        console.error(`        ${JSON.stringify(result, null, 2).slice(0, 300)}`);
        throw new Error('API 响应中未找到翻译内容');
    }

    // 解析 JSON
    console.log(`     🔍 提取翻译结果...`);
    const jsonMatch = translatedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        console.error(`     ❌ 无法提取 JSON，响应内容: ${translatedText.slice(0, 200)}`);
        throw new Error('无法从 AI 响应中提取 JSON');
    }

    const translated = JSON.parse(jsonMatch[0]);
    const translatedCount = Object.keys(translated).length;
    console.log(`     ✅ 成功翻译 ${translatedCount}/${textCount} 条`);

    return translated;
}

// 更新语言文件
async function updateLanguage(lang, sourceMessages, sourceTexts, apiUrl, apiKey, model, index, total) {
    const langPath = path.join(LOCALES_DIR, lang, 'messages.json');

    console.log(`\n[${ (index + 1).toString().padStart(2)}/${total.toString().padStart(2)}] 📝 ${lang} (${LANGUAGES[lang]})`);

    // 读取现有翻译
    let langMessages = {};
    let existingTexts = {};

    if (fs.existsSync(langPath)) {
        langMessages = JSON.parse(fs.readFileSync(langPath, 'utf8'));
        existingTexts = getMessageTexts(langMessages);
        console.log(`     📂 已有翻译: ${Object.keys(langMessages).length} 条`);
    } else {
        console.log(`     📄 新建语言文件`);
    }

    // 为当前语言单独检测差异
    const added = {};
    const modified = {};
    const deleted = {};

    // 检测新增和修改
    for (const [key, text] of Object.entries(sourceTexts)) {
        if (!existingTexts[key]) {
            added[key] = text;
        } else if (existingTexts[key] !== langMessages[key]?.message) {
            // 如果源文本变化，需要重新翻译
            const sourceKey = sourceTexts[key];
            if (sourceKey !== existingTexts[key]) {
                modified[key] = text;
            }
        }
    }

    // 检测删除
    for (const key of Object.keys(existingTexts)) {
        if (!sourceTexts[key]) {
            deleted[key] = existingTexts[key];
        }
    }

    const hasChanges = Object.keys(added).length > 0 ||
        Object.keys(modified).length > 0 ||
        Object.keys(deleted).length > 0;

    if (!hasChanges) {
        console.log(`     ✅ 无需更新`);
        return { success: true, changes: 0 };
    }

    // 显示差异
    const totalChanges = Object.keys(added).length + Object.keys(modified).length + Object.keys(deleted).length;
    if (Object.keys(added).length > 0) {
        console.log(`     ➕ 新增: ${Object.keys(added).length} 条`);
    }
    if (Object.keys(modified).length > 0) {
        console.log(`     ✏️  修改: ${Object.keys(modified).length} 条`);
    }
    if (Object.keys(deleted).length > 0) {
        console.log(`     ➖ 删除: ${Object.keys(deleted).length} 条`);
    }

    // 需要翻译的内容
    const toTranslate = { ...added, ...modified };

    if (Object.keys(toTranslate).length > 0) {
        console.log(`     🔄 正在翻译...`);
        try {
            const translated = await translateTexts(toTranslate, lang, apiUrl, apiKey, model);

            // 更新消息
            for (const [key, translatedText] of Object.entries(translated)) {
                langMessages[key] = {
                    message: translatedText
                };
                // 保留源语言的 placeholders 和 description
                if (sourceMessages[key]?.placeholders) {
                    langMessages[key].placeholders = sourceMessages[key].placeholders;
                }
                if (sourceMessages[key]?.description) {
                    langMessages[key].description = sourceMessages[key].description;
                }
            }

        } catch (translateError) {
            console.error(`     ❌ 翻译失败: ${translateError.message}`);
            throw translateError;
        }
    }

    // 删除已移除的消息
    if (Object.keys(deleted).length > 0) {
        for (const key of Object.keys(deleted)) {
            delete langMessages[key];
        }
    }

    // 保存
    const langDir = path.join(LOCALES_DIR, lang);
    if (!fs.existsSync(langDir)) {
        fs.mkdirSync(langDir, { recursive: true });
    }
    fs.writeFileSync(langPath, JSON.stringify(langMessages, null, 2), 'utf8');
    console.log(`     💾 已保存 (共 ${Object.keys(langMessages).length} 条)`);

    return { success: true, changes: totalChanges };
}

// 主函数
async function main() {
    const args = parseArgs();

    console.log('\n🌍 OpenIn 增量翻译工具\n');

    // 读取源语言文件
    const sourcePath = path.join(LOCALES_DIR, SOURCE_LOCALE, 'messages.json');
    if (!fs.existsSync(sourcePath)) {
        console.error(`❌ 错误: 找不到源文件 ${sourcePath}`);
        process.exit(1);
    }

    const sourceMessages = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const currentTexts = getMessageTexts(sourceMessages);

    console.log(`📖 基础语言: ${SOURCE_LOCALE}`);
    console.log(`📊 消息数量: ${Object.keys(sourceMessages).length} 条\n`);

    // 获取 API 配置
    const apiUrl = args['api-url'] || process.env.OPENAI_API_URL;
    const apiKey = args['api-key'] || process.env.OPENAI_API_KEY;
    const model = args.model || process.env.OPENAI_MODEL || 'gpt-4';

    if (!apiUrl || !apiKey) {
        console.error('\n❌ 错误: 缺少 API 配置');
        console.log('   请设置环境变量: OPENAI_API_URL, OPENAI_API_KEY\n');
        process.exit(1);
    }

    // 确定要更新的语言
    let targetLanguages = [];
    if (args.target) {
        const lang = args.target.toLowerCase();
        if (!LANGUAGES[lang]) {
            console.error(`\n❌ 错误: 不支持的语言 "${lang}"\n`);
            process.exit(1);
        }
        targetLanguages = [lang];
        console.log(`🎯 模式: 单语言翻译`);
    } else if (args.all) {
        // 翻译所有语言（除了源语言）
        targetLanguages = Object.keys(LANGUAGES).filter(lang => lang !== SOURCE_LOCALE);
        console.log(`🌐 模式: 全语言翻译 (${targetLanguages.length} 个语言)`);
    } else if (args.sync) {
        targetLanguages = getExistingLanguages();
        if (targetLanguages.length === 0) {
            console.log('\n⚠️  没有找到已存在的语言文件');
            console.log('   提示: 使用 --target <LANG> 创建新语言\n');
            process.exit(0);
        }
        console.log(`🔄 模式: 同步现有语言 (${targetLanguages.length} 个)`);
    } else {
        console.error('\n❌ 错误: 请指定翻译模式\n');
        console.log('   可用模式:');
        console.log('   --target <LANG>  翻译单个语言 (例: --target en)');
        console.log('   --sync           同步所有已存在的语言');
        console.log('   --all            翻译所有支持的语言\n');
        console.log('   支持的语言代码:');
        const langs = Object.keys(LANGUAGES).filter(l => l !== SOURCE_LOCALE);
        for (let i = 0; i < langs.length; i += 4) {
            const row = langs.slice(i, i + 4);
            console.log(`     ${row.join(', ')}`);
        }
        console.log();
        process.exit(1);
    }

    console.log(`🎯 目标语言: ${targetLanguages.length} 个`);
    console.log(`🤖 模型: ${model}`);
    console.log(`🔗 API: ${apiUrl.split('/')[2]}\n`);
    console.log('━'.repeat(60));

    // 更新每个语言
    let successCount = 0;
    let failedCount = 0;
    let totalChanges = 0;
    const failed = [];

    const startTime = Date.now();

    try {
        for (let i = 0; i < targetLanguages.length; i++) {
            const lang = targetLanguages[i];
            try {
                const result = await updateLanguage(lang, sourceMessages, currentTexts, apiUrl, apiKey, model, i, targetLanguages.length);
                if (result.success) {
                    successCount++;
                    totalChanges += result.changes;
                }

                // 在每个语言之间添加小延迟，避免API限流
                if (i < targetLanguages.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } catch (error) {
                failedCount++;
                failed.push({ lang, error: error.message });
                console.error(`     ⚠️  跳过此语言，继续下一个...\n`);
            }
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log('\n' + '━'.repeat(60));
        console.log('\n📊 翻译统计:');
        console.log(`   ✅ 成功: ${successCount}/${targetLanguages.length} 个语言`);
        console.log(`   📝 更新: ${totalChanges} 条消息`);
        console.log(`   ⏱️  耗时: ${elapsed}s`);

        if (failedCount > 0) {
            console.log(`\n   ❌ 失败: ${failedCount} 个语言`);
            failed.forEach(({ lang, error }) => {
                console.log(`      - ${lang} (${LANGUAGES[lang]}): ${error}`);
            });
        }

        // 更新缓存
        const cache = loadCache();
        cache[SOURCE_LOCALE] = currentTexts;
        saveCache(cache);

        console.log(`\n✨ 翻译完成！`);
        console.log(`📁 缓存: ${path.basename(CACHE_FILE)}\n`);

        if (failedCount > 0) {
            process.exit(1);
        }

    } catch (error) {
        console.error(`\n❌ 翻译过程中断: ${error.message}\n`);
        process.exit(1);
    }
}

main().catch(error => {
    console.error('❌ 意外错误:', error.message);
    process.exit(1);
});
