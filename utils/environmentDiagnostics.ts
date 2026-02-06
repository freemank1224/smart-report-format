/**
 * 环境诊断脚本
 * 检测本地和 Vercel 环境差异
 */

export const detectEnvironment = () => {
  const env = {
    platform: typeof window !== 'undefined' ? 'browser' : 'server',
    isVercel: !!(process.env.VERCEL || process.env.VERCEL_ENV),
    isProduction: import.meta.env.PROD,
    useServerless: import.meta.env.PROD || import.meta.env.VITE_USE_SERVERLESS === 'true',
    
    // 浏览器信息
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
    
    // PDF.js 配置
    pdfWorkerSrc: typeof window !== 'undefined' && (window as any).pdfjsLib 
      ? (window as any).pdfjsLib.GlobalWorkerOptions?.workerSrc 
      : 'N/A',
    
    // 时区和本地化（可能影响数字格式化）
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
    
    // 浮点数精度测试
    floatPrecision: testFloatPrecision()
  };

  console.group('🌍 环境诊断');
  console.table(env);
  console.groupEnd();

  return env;
};

/**
 * 测试浮点数运算精度
 */
function testFloatPrecision() {
  const tests = [
    { a: 0.1, b: 0.2, expected: 0.3 },
    { a: 1.1, b: 2.2, expected: 3.3 },
    { a: 10.5, b: 5.25, expected: 15.75 }
  ];

  const results = tests.map(t => ({
    test: `${t.a} + ${t.b}`,
    result: t.a + t.b,
    expected: t.expected,
    match: Math.abs((t.a + t.b) - t.expected) < Number.EPSILON
  }));

  return results.every(r => r.match) ? '正常' : '异常';
}

/**
 * 比较 API 调用路径
 */
export const checkApiPath = async () => {
  const useServerless = import.meta.env.PROD || import.meta.env.VITE_USE_SERVERLESS === 'true';
  
  console.group('🔌 API 调用路径');
  console.log('当前模式:', useServerless ? 'Serverless (Vercel)' : 'Direct (本地)');
  
  if (useServerless) {
    console.log('API 端点: /api/gemini 或 /api/openai');
    console.log('⚠️ 注意: Vercel 环境变量必须正确配置');
  } else {
    console.log('直接调用: Gemini/OpenAI API');
    console.log('⚠️ 注意: 浏览器环境可能有 CORS 限制');
  }
  console.groupEnd();

  return { useServerless };
};

/**
 * 测试 Worker 加载
 */
export const testWorkerLoading = async () => {
  console.group('👷 PDF Worker 测试');
  
  try {
    const workerUrl = `https://esm.sh/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs`;
    console.log('Worker URL:', workerUrl);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const startTime = performance.now();
    const response = await fetch(workerUrl, { 
      method: 'HEAD',
      signal: controller.signal 
    });
    const loadTime = performance.now() - startTime;
    
    clearTimeout(timeoutId);
    
    console.log('✅ Worker 可访问');
    console.log('加载时间:', loadTime.toFixed(2), 'ms');
    console.log('状态码:', response.status);
    
    if (loadTime > 1000) {
      console.warn('⚠️ Worker 加载较慢，可能影响 PDF 解析');
    }
    
    console.groupEnd();
    return { success: true, loadTime };
  } catch (error) {
    console.error('❌ Worker 加载失败:', error);
    console.groupEnd();
    return { success: false, error };
  }
};

/**
 * 完整的环境检测报告
 */
export const generateDiagnosticReport = async () => {
  console.log('🔍 开始环境诊断...\n');
  
  const env = detectEnvironment();
  const apiPath = await checkApiPath();
  const worker = await testWorkerLoading();
  
  const report = {
    environment: env,
    apiConfiguration: apiPath,
    workerStatus: worker,
    timestamp: new Date().toISOString(),
    recommendations: []
  };

  // 生成建议
  if (!worker.success) {
    report.recommendations.push('❌ PDF Worker 无法加载，请检查网络连接或使用本地 Worker 文件');
  }
  
  if (worker.loadTime && worker.loadTime > 1000) {
    report.recommendations.push('⚠️ CDN 访问较慢，建议在 Vercel 中配置 Edge Caching');
  }
  
  if (env.isVercel && !env.useServerless) {
    report.recommendations.push('⚠️ Vercel 环境但未使用 Serverless，请检查配置');
  }

  console.log('\n📊 诊断报告:');
  console.log(JSON.stringify(report, null, 2));
  
  return report;
};
