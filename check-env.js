#!/usr/bin/env node

/**
 * 环境配置检查脚本
 * 检查 Gemini API 配置是否正确
 */

console.log('🔍 检查 Gemini 视觉识别环境配置...\n');

// 检查 .env.local 文件
const fs = require('fs');
const path = require('path');

const envLocalPath = path.join(__dirname, '.env.local');
const envExamplePath = path.join(__dirname, '.env.example');

let hasEnvLocal = false;
let apiKey = null;

if (fs.existsSync(envLocalPath)) {
  hasEnvLocal = true;
  const envContent = fs.readFileSync(envLocalPath, 'utf8');
  const match = envContent.match(/VITE_API_KEY=(.+)/);
  if (match && match[1] && match[1] !== 'your_gemini_api_key_here') {
    apiKey = match[1].trim();
  }
}

console.log('📁 文件检查:');
console.log(`  .env.local: ${hasEnvLocal ? '✅ 存在' : '❌ 不存在'}`);
console.log(`  .env.example: ${fs.existsSync(envExamplePath) ? '✅ 存在' : '❌ 不存在'}\n`);

console.log('🔑 API Key 检查:');
if (apiKey) {
  console.log(`  VITE_API_KEY: ✅ 已配置`);
  console.log(`  前缀: ${apiKey.substring(0, 10)}...`);
  console.log(`  长度: ${apiKey.length} 字符\n`);
} else {
  console.log(`  VITE_API_KEY: ❌ 未配置或使用默认值\n`);
}

console.log('📋 推荐的模型配置:');
console.log('  主要模型: gemini-2.5-flash (支持视觉，快速且便宜)');
console.log('  备用模型: gemini-2.0-flash-exp (支持视觉，更强大)\n');

if (!hasEnvLocal || !apiKey) {
  console.log('❌ 配置不完整！\n');
  console.log('🔧 修复步骤:');
  console.log('1. 复制 .env.example 为 .env.local:');
  console.log('   cp .env.example .env.local\n');
  console.log('2. 获取 Gemini API Key:');
  console.log('   访问: https://aistudio.google.com/app/apikey\n');
  console.log('3. 编辑 .env.local，设置 VITE_API_KEY:\n');
  console.log('   VITE_API_KEY=你的API密钥\n');
  console.log('4. 重启开发服务器:');
  console.log('   npm run dev\n');
  process.exit(1);
} else {
  console.log('✅ 配置检查完成！\n');
  console.log('💡 下一步:');
  console.log('1. 确保开发服务器正在运行: npm run dev');
  console.log('2. 上传 PDF 文件测试视觉识别');
  console.log('3. 检查浏览器控制台的日志输出\n');
  process.exit(0);
}
