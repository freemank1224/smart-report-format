# PDF 表格解析问题诊断与修复指南

## 问题现象
本地解析 PDF 模板文件时表格正常，但部署到 Vercel 后使用同样的模型解析总是容易少一列。

## 根本原因分析

### 1. **PDF 文本提取的环境差异** 🔴
**问题**: PDF.js 使用坐标排序重建文本结构，浮点数坐标在不同环境可能有细微差异

**影响**: 
- 硬编码的 `lineThreshold = 2.5` 可能导致列边界判断不一致
- 坐标浮点数比较 `l.y === r.y` 不够鲁棒
- 表格列在临界值附近容易被错误分组

**已修复**:
- ✅ 坐标值四舍五入到小数点后 2 位，确保跨环境一致性
- ✅ 动态计算行间距阈值，适应不同 PDF 布局
- ✅ 使用 epsilon 值 (0.1) 进行浮点数比较，而非严格相等

### 2. **表格数据后处理不一致** ⚠️
**问题**: `removeRedundantTableHeaders` 函数可能误删表格数据行

**影响**:
- 正则匹配 `NO.|Weight|INCI` 等关键词可能匹配到数据行
- 本地和 Vercel 的后处理逻辑不完全一致

**已修复**:
- ✅ 增加全大写检查 `isAllUpperOrPunct`，只删除标题行
- ✅ 统一本地和 Serverless 的后处理流程
- ✅ 更严格的删除条件，避免误删数据

### 3. **输入文本截断风险** 🔴
**问题**: Prompt 中 `rawText.substring(0, 60000)` 可能截断表格

**影响**: 
- 长 PDF 的表格数据可能被截断
- LLM 看不到完整表格结构，导致列数错误

**建议**: 
- 监控 PDF 文本长度，必要时增加限制或分段处理
- 优先传递关键 Section（如 Section 1）的完整数据

### 4. **Worker 加载差异** ⚠️
**问题**: CDN Worker 在 Vercel 环境加载速度和兼容性可能不同

**影响**: Worker 初始化失败或超时可能导致解析异常

## 代码修复内容

### `utils/fileProcessors.ts`

```diff
- x: typeof e === 'number' ? e : 0,
- y: typeof f === 'number' ? f : 0
+ x: typeof e === 'number' ? Math.round(e * 100) / 100 : 0,
+ y: typeof f === 'number' ? Math.round(f * 100) / 100 : 0

- if (l.y === r.y) return l.x - r.x;
+ const yDiff = r.y - l.y;
+ if (Math.abs(yDiff) < 0.1) return l.x - r.x;

- const lineThreshold = 2.5;
+ // 动态计算行间距阈值
+ const yValues = items.map((item: any) => item.y).sort((a, b) => b - a);
+ const yDiffs = yValues.slice(0, -1).map((y, i) => Math.abs(y - yValues[i + 1]));
+ const lineThreshold = Math.max(1.5, Math.min(...yDiffs.filter(d => d > 0.1), 3.5));
```

### `services/geminiService.ts` & `api/gemini.ts`

```diff
+ // 统一后处理逻辑
+ let normalizedContent = removeRedundantTableHeaders(content);
  normalizedContent = normalizeSectionFormatting(normalizedContent);
  normalizedContent = normalizeKeyValueBolding(normalizedContent);

+ // 更严格的表格标题删除条件
+ const isAllUpperOrPunct = /^[A-Z0-9\s.%():-]+$/.test(trimmed);
+ if (hasMultipleColumnWords && matchCount >= 2 && wordCount <= 8 
+     && !trimmed.includes('|') && isAllUpperOrPunct) {
```

## 使用诊断工具

### 1. 环境诊断

```typescript
import { generateDiagnosticReport } from './utils/environmentDiagnostics';

// 在应用启动时运行
const report = await generateDiagnosticReport();
console.log(report);
```

### 2. PDF 解析调试

```typescript
import { debugPdfExtraction, validateTableStructure } from './utils/pdfDebugger';
import { extractTextFromPdf } from './utils/fileProcessors';

const file = /* PDF File */;
const text = await extractTextFromPdf(file);

// 验证表格结构
const tables = validateTableStructure(text);
```

### 3. 本地 vs Vercel 对比

```typescript
import { comparePdfExtractions } from './utils/pdfDebugger';

const localResult = /* 本地提取的文本 */;
const vercelResult = /* Vercel 提取的文本 */;

const diff = comparePdfExtractions(localResult, vercelResult);
console.log('差异分析:', diff);
```

## 部署检查清单

### Vercel 环境变量
- [ ] `GEMINI_API_KEY` 已配置
- [ ] `VERCEL` 环境变量存在（自动设置）
- [ ] API Routes 正常工作（测试 `/api/gemini`）

### 网络配置
- [ ] CDN Worker 可访问（测试 `esm.sh`）
- [ ] API 请求无 CORS 问题
- [ ] 函数超时限制足够（默认 10s，可能需要增加）

### 代码部署
- [ ] 最新代码已部署到 Vercel
- [ ] Build 过程无错误
- [ ] 环境变量在生产环境生效

## 进一步调试建议

### 1. 添加日志

在 Vercel 部署后，添加详细日志：

```typescript
// api/gemini.ts
console.log('📄 原始文本长度:', rawText.length);
console.log('📊 提取的表格数:', (normalizedContent.match(/\|.*\|/g) || []).length);
console.log('🔍 变量数量:', detectedVariables.length);
```

在 Vercel Dashboard > Functions > Logs 中查看输出

### 2. 对比输出

保存本地和 Vercel 的 LLM 输出到文件，使用 diff 工具对比：

```bash
diff local-output.md vercel-output.md
```

### 3. 测试不同模型

如果问题持续，尝试：
- 切换到不同的 LLM 模型（如 GPT-4）
- 减少 prompt 长度
- 增加表格解析的专门指令

## 预防措施

### 1. 表格解析增强 Prompt

在 `buildAnalyzePrompt` 中增加：

```
⚠️ TABLE PARSING CRITICAL RULES:
1. Count columns in the FIRST table row carefully
2. Ensure ALL subsequent rows have THE SAME number of columns
3. If a row seems to have fewer columns, check for merged cells or line breaks
4. NEVER skip columns - use empty cells if data is missing
5. Verify header row matches data row column count
```

### 2. 健壮性测试

创建测试用例，包含：
- 各种列数的表格（3列、4列、5列）
- 包含空单元格的表格
- 多页表格
- 不同字体和间距的 PDF

### 3. 回退机制

```typescript
// 如果解析失败，尝试降级方案
try {
  const result = await analyzePdfStructure(rawText);
  if (!validateResult(result)) {
    throw new Error('结果验证失败');
  }
  return result;
} catch (error) {
  console.warn('主解析失败，尝试备用方案', error);
  return await fallbackAnalysis(rawText);
}
```

## 联系与反馈

如果问题仍然存在，请提供：
1. 示例 PDF 文件
2. 本地输出的 Markdown
3. Vercel 输出的 Markdown  
4. Vercel 函数日志
5. 环境诊断报告

这将帮助进一步定位问题。
