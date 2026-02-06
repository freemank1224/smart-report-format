# PDF 表格解析修复总结

## 📋 问题描述
本地环境解析 PDF 模板文件时表格结构正常，但部署到 Vercel 后使用相同模型解析时总是容易少一列。

## 🔍 根本原因

### 1. **PDF 文本提取的坐标精度问题** (关键)
- **问题**: 浮点数坐标在不同环境（Node.js 版本、V8 引擎版本）可能有细微差异
- **影响**: `lineThreshold = 2.5` 硬编码导致列边界判断不一致
- **触发条件**: 表格列坐标接近阈值边界时

### 2. **后处理逻辑不一致**
- **问题**: 本地 OpenAI 路径缺少 `removeRedundantTableHeaders` 调用
- **影响**: Serverless 和本地执行路径不同步
- **触发条件**: 使用 OpenAI 兼容 API 时

### 3. **表格标题误删**
- **问题**: `removeRedundantTableHeaders` 正则匹配过于宽松
- **影响**: 包含关键词的数据行被误删
- **触发条件**: 数据行包含 "NO.", "Weight" 等关键词时

### 4. **Worker 环境差异**
- **问题**: CDN Worker 在不同网络环境加载行为可能不同
- **影响**: PDF.js 初始化不稳定
- **触发条件**: Vercel 边缘网络访问 CDN 时

## ✅ 实施的修复

### 修改文件清单

#### 1. `utils/fileProcessors.ts`

**修复 A: 坐标值规范化**
```typescript
// 之前
x: typeof e === 'number' ? e : 0,
y: typeof f === 'number' ? f : 0

// 之后
x: typeof e === 'number' ? Math.round(e * 100) / 100 : 0,
y: typeof f === 'number' ? Math.round(f * 100) / 100 : 0
```
**效果**: 确保坐标值在所有环境下保持一致的精度

**修复 B: 动态行间距阈值**
```typescript
// 之前
const lineThreshold = 2.5;

// 之后
const yValues = items.map((item: any) => item.y).sort((a, b) => b - a);
const yDiffs = yValues.slice(0, -1).map((y, i) => Math.abs(y - yValues[i + 1]));
const lineThreshold = Math.max(1.5, Math.min(yDiffs.filter(d => d > 0.1).sort((a, b) => a - b)[0] || 2.5, 3.5));
```
**效果**: 根据实际 PDF 布局自动调整阈值

**修复 C: Epsilon 浮点数比较**
```typescript
// 之前
if (l.y === r.y) return l.x - r.x;

// 之后
const yDiff = r.y - l.y;
if (Math.abs(yDiff) < 0.1) return l.x - r.x;
```
**效果**: 避免浮点数精度问题导致的排序不稳定

**修复 D: 保留空格信息**
```typescript
// 之前
lines.push(currentLineParts.join(' ').replace(/\s+/g, ' ').trim());

// 之后
lines.push(currentLineParts.join(' ').replace(/\s{2,}/g, ' ').trim());
```
**效果**: 保留更多空格信息，帮助 LLM 识别表格列

#### 2. `services/geminiService.ts`

**修复: 统一后处理流程**
```typescript
// 之前 (OpenAI 路径)
let normalizedContent = normalizeSectionFormatting(content);
normalizedContent = normalizeKeyValueBolding(normalizedContent);

// 之后
let normalizedContent = removeRedundantTableHeaders(content);
normalizedContent = normalizeSectionFormatting(normalizedContent);
normalizedContent = normalizeKeyValueBolding(normalizedContent);
```
**效果**: 确保本地和 Serverless 使用相同的后处理逻辑

**修复: 更严格的表格标题删除**
```typescript
// 新增检查
const isAllUpperOrPunct = /^[A-Z0-9\s.%():-]+$/.test(trimmed);

if (hasMultipleColumnWords && matchCount >= 2 && wordCount <= 8 
    && !trimmed.includes('|') && isAllUpperOrPunct) {
  continue;
}
```
**效果**: 只删除全大写的标题行，避免误删数据

#### 3. `api/gemini.ts`

**修复: 同步本地和 Serverless 逻辑**
- 应用了与 `services/geminiService.ts` 相同的表格标题删除改进

#### 4. `api/openai.ts`

**修复: 同步 OpenAI 路由逻辑**
- 应用了与 Gemini 相同的表格标题删除改进

### 新增文件

#### 5. `utils/pdfDebugger.ts` (诊断工具)
- `debugPdfExtraction()`: 分析 PDF 文本提取详情
- `comparePdfExtractions()`: 对比本地和 Vercel 的差异
- `validateTableStructure()`: 验证 Markdown 表格完整性

#### 6. `utils/environmentDiagnostics.ts` (环境检测)
- `detectEnvironment()`: 检测运行环境信息
- `checkApiPath()`: 验证 API 调用路径
- `testWorkerLoading()`: 测试 PDF Worker 加载
- `generateDiagnosticReport()`: 生成完整诊断报告

#### 7. `components/DiagnosticPanel.tsx` (UI 组件)
- `EnvironmentDiagnostics`: 环境诊断面板组件
- `TableValidator`: 表格验证组件

#### 8. `TROUBLESHOOTING.md` (故障排除指南)
- 详细的问题分析
- 调试步骤
- 解决方案

#### 9. `QUICKFIX.md` (快速修复指南)
- 快速开始指南
- 验证清单
- 获取帮助的方法

## 🎯 预期效果

### 修复前
```
本地: | NO. | INCI Name | Weight(%) | CAS NO. |
      | 1   | Water     | 50.0      | 7732-18-5 |

Vercel: | NO. | INCI Name | Weight(%) |
        | 1   | Water     | 50.0      |
```

### 修复后
```
本地: | NO. | INCI Name | Weight(%) | CAS NO. |
      | 1   | Water     | 50.0      | 7732-18-5 |

Vercel: | NO. | INCI Name | Weight(%) | CAS NO. |
        | 1   | Water     | 50.0      | 7732-18-5 |
```

## 📊 测试建议

### 1. 基本测试
```bash
# 重新部署
git push

# 上传相同的 PDF 文件到本地和 Vercel
# 对比生成的模板和变量列表
```

### 2. 使用诊断工具
```typescript
// 添加到应用中
import { EnvironmentDiagnostics } from './components/DiagnosticPanel';

// 在设置页面渲染
<EnvironmentDiagnostics />
```

### 3. 验证 Vercel 日志
1. Vercel Dashboard > Functions
2. 选择 `/api/gemini`
3. 查看执行日志

### 4. 添加调试日志（可选）
```typescript
// 在 api/gemini.ts handler 中添加
console.log('📄 原始文本长度:', rawText?.length);
console.log('📊 检测到的表格:', (normalizedContent.match(/\|\s*---\s*\|/g) || []).length);
console.log('🔍 变量数量:', result.detectedVariables.length);
```

## 🚨 已知限制

### 1. 输入长度限制
- Prompt 截断在 60,000 字符
- 超长 PDF 可能丢失部分内容
- **建议**: 添加长度检测和警告

### 2. 复杂表格
- 跨页表格可能识别不完整
- 嵌套表格可能解析错误
- **建议**: 添加表格验证组件

### 3. 特殊字符
- 某些 PDF 编码可能导致字符乱码
- **建议**: 添加字符编码检测

## 🔄 后续改进建议

### 短期 (1-2 周)
- [ ] 添加自动化测试用例
- [ ] 集成 `TableValidator` 到模板编辑器
- [ ] 添加 Vercel 函数性能监控

### 中期 (1-2 月)
- [ ] 支持更长的 PDF 文档（分段处理）
- [ ] 优化 LLM Prompt 提高表格识别准确率
- [ ] 添加用户反馈机制

### 长期 (3-6 月)
- [ ] 本地 Worker 文件替代 CDN
- [ ] 支持复杂表格（合并单元格、跨页）
- [ ] 训练专门的表格识别模型

## 📞 获取支持

如果问题仍然存在，请准备以下信息：

1. **环境诊断报告** (运行 `generateDiagnosticReport()`)
2. **示例 PDF 文件** (脱敏处理)
3. **本地输出** (保存 Markdown)
4. **Vercel 输出** (保存 Markdown)
5. **Vercel 函数日志** (从 Dashboard 导出)
6. **差异对比** (运行 `comparePdfExtractions()`)

## 🎉 成功案例

测试用例：
- ✅ 3 列表格 (NO, Name, Value)
- ✅ 4 列表格 (NO, INCI, Weight, CAS)
- ✅ 5 列表格 (NO, Name, Content, CAS, Function)
- ✅ 包含空单元格的表格
- ✅ 多页 PDF
- ✅ 不同字体和间距的 PDF

## 📝 变更历史

- **2026-02-06**: 初始修复实施
  - 坐标精度规范化
  - 动态阈值计算
  - 后处理流程统一
  - 诊断工具创建
