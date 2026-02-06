# PDF 表格解析修复 - 快速指南

## 🎯 问题
本地解析正常，Vercel 部署后表格少一列

## ✅ 已修复
1. **坐标精度**: 统一浮点数到 2 位小数
2. **动态阈值**: 自适应计算行间距
3. **后处理一致性**: 统一本地和 Serverless 流程
4. **表格检测**: 更严格的标题删除条件

## 🚀 快速开始

### 1. 立即测试修复

```bash
# 重新部署到 Vercel
git add .
git commit -m "fix: PDF table parsing environment consistency"
git push
```

### 2. 添加诊断面板（可选）

在你的应用中添加诊断工具：

```typescript
// App.tsx 或其他组件
import { EnvironmentDiagnostics, TableValidator } from './components/DiagnosticPanel';

// 在设置面板中添加
<EnvironmentDiagnostics />

// 在模板编辑器中添加
<TableValidator markdown={templateContent} />
```

### 3. 监控解析日志

在 Vercel Dashboard 中查看函数日志：
1. 进入项目 > Functions
2. 选择 `/api/gemini` 或 `/api/openai`
3. 查看 Logs 标签

### 4. 对比测试

使用诊断工具对比本地和 Vercel 的输出：

```typescript
import { comparePdfExtractions } from './utils/pdfDebugger';

// 保存本地结果
localStorage.setItem('local-result', extractedText);

// 在 Vercel 上获取结果后
const localResult = localStorage.getItem('local-result');
const diff = comparePdfExtractions(localResult, extractedText);
console.log('差异:', diff);
```

## 📊 验证清单

部署后验证以下项目：

- [ ] 上传相同的 PDF，检查表格列数
- [ ] 对比生成的变量列表（本地 vs Vercel）
- [ ] 检查 Vercel 函数日志无错误
- [ ] 运行环境诊断工具
- [ ] 测试多个不同的 PDF 文件

## 🔧 如果问题仍然存在

### 方案 A: 增加调试日志

在 `api/gemini.ts` 第 432 行后添加：

```typescript
console.log('📄 PDF 文本长度:', rawText.length);
console.log('📊 归一化后长度:', normalizedContent.length);
console.log('🔍 表格数量:', (normalizedContent.match(/\|\s*---\s*\|/g) || []).length);
console.log('📝 变量数量:', detectedVariables.length);
```

### 方案 B: 尝试不同模型

切换到更强大的模型可能提高准确性：

```typescript
// 在 api/gemini.ts 中
model: 'gemini-2.0-flash-exp'  // 或更高级的模型
```

### 方案 C: 减少输入长度

如果 PDF 很长，优先传递关键部分：

```typescript
// utils/fileProcessors.ts
const essentialText = extractEssentialSections(rawText);
// 只传递 Section 1 和包含表格的部分
```

### 方案 D: 提供更多上下文

提供以下信息以便进一步诊断：

1. **示例 PDF** (脱敏后)
2. **本地输出** (Markdown)
3. **Vercel 输出** (Markdown)
4. **环境诊断报告** (`generateDiagnosticReport()` 的输出)
5. **Vercel 函数日志**

## 📚 相关文档

- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - 详细故障排除指南
- [utils/pdfDebugger.ts](./utils/pdfDebugger.ts) - 调试工具
- [utils/environmentDiagnostics.ts](./utils/environmentDiagnostics.ts) - 环境诊断

## 🎓 技术细节

### 修改的文件

1. **utils/fileProcessors.ts**
   - 坐标值四舍五入
   - 动态行间距阈值
   - 改进的浮点数比较

2. **services/geminiService.ts**
   - 统一后处理流程
   - 添加 `removeRedundantTableHeaders`

3. **api/gemini.ts**
   - 更严格的标题删除条件
   - 统一的归一化流程

### 关键改进

```typescript
// 之前: 硬编码阈值
const lineThreshold = 2.5;

// 之后: 动态计算
const yValues = items.map(item => item.y).sort((a, b) => b - a);
const yDiffs = yValues.slice(0, -1).map((y, i) => Math.abs(y - yValues[i + 1]));
const lineThreshold = Math.max(1.5, Math.min(...yDiffs.filter(d => d > 0.1), 3.5));
```

```typescript
// 之前: 严格相等
if (l.y === r.y) return l.x - r.x;

// 之后: Epsilon 比较
const yDiff = r.y - l.y;
if (Math.abs(yDiff) < 0.1) return l.x - r.x;
```

## 💡 预防建议

1. **添加自动化测试**: 创建 PDF 解析的单元测试
2. **版本控制输出**: 保存每次解析的结果用于对比
3. **监控告警**: 设置 Vercel 函数失败告警
4. **定期验证**: 每次部署后运行验证套件

## 🤝 获取帮助

如需进一步帮助，请提供完整的诊断信息和示例文件。
