# Vercel 部署问题修复总结

## 问题诊断

在部署到 Vercel 后，Gemini 视觉分析服务无法正常工作，报错：
```
POST https://see-all.top/api/gemini 400 (Bad Request)
pdfFile is required (base64 encoded)
```

## 根本原因

Serverless 函数 (`/api/gemini.ts`) 错误地期望接收 `pdfFile` 参数，但客户端实际上发送的是已渲染的 `pageImages`。这是因为：

1. 客户端在浏览器中使用 `pdfjs-dist` 渲染 PDF 页面为图片
2. 然后将这些图片（base64 格式）发送给 serverless 函数
3. 但 serverless 函数仍在检查 `pdfFile` 参数，导致 400 错误

## 修复内容

### 1. 修复 Gemini Serverless 函数 ([api/gemini.ts](api/gemini.ts))

**修改前：**
```typescript
if (action === 'analyzePdfWithVision') {
  if (!pdfFile) {
    res.status(400).json({ error: 'pdfFile is required (base64 encoded)' });
    return;
  }
  // ... 复杂的 PDF 转换逻辑
  const { pageImages } = req.body;
  // ...
}
```

**修改后：**
```typescript
if (action === 'analyzePdfWithVision') {
  // 直接接收客户端渲染的页面图片
  if (!pageImages || !Array.isArray(pageImages)) {
    res.status(400).json({ 
      error: 'pageImages array is required. Client should render PDF pages and send as base64 images.' 
    });
    return;
  }
  // 直接使用 pageImages，无需 PDF 转换
}
```

### 2. 添加 CORS 头部

为两个 serverless 函数（`api/gemini.ts` 和 `api/openai.ts`）添加 CORS 支持：

```typescript
res.setHeader('Access-Control-Allow-Credentials', 'true');
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
res.setHeader('Access-Control-Allow-Headers', '...');
```

### 3. 改进错误处理和日志

- 添加详细的控制台日志，包括请求参数信息
- 改进客户端错误处理，显示完整错误信息
- 添加请求/响应的详细日志记录

### 4. 创建 Vercel 配置文件 ([vercel.json](vercel.json))

```json
{
  "functions": {
    "api/**/*.ts": {
      "maxDuration": 60,
      "memory": 1024
    }
  }
}
```

这确保了：
- Serverless 函数有足够的执行时间（60秒）
- 足够的内存（1024MB）处理大型图片数据

## 部署步骤

### 1. 提交并推送代码

```bash
git add .
git commit -m "fix: 修复 Vercel 部署后 Vision API 无法使用的问题"
git push
```

### 2. 在 Vercel 中配置环境变量

确保在 Vercel 项目设置中配置了以下环境变量：

- `GEMINI_API_KEY`: 你的 Google Gemini API 密钥

### 3. 触发重新部署

Vercel 会自动检测到推送并开始部署。你也可以手动触发重新部署。

### 4. 验证部署

部署完成后，访问你的应用并测试：

1. 上传一个 PDF 文件
2. 检查浏览器控制台的日志
3. 确认成功调用 Vision API 并返回结果

预期看到的日志：
```
🚀 Starting multimodal vision-based PDF analysis...
📸 Rendering PDF pages to images...
📄 Rendered X pages from PDF
🔍 Using Gemini Vision (Serverless)...
✅ Vision analysis successful
```

## 网络条件测试

修复后，应用应该在任何网络条件下都能正常工作：

1. **国内网络**：通过 Vercel 的 serverless 函数代理 API 调用
2. **国外网络**：同样通过 serverless 函数，保持一致性
3. **慢速网络**：已增加超时时间到 60 秒

## 故障排除

如果部署后仍有问题，请检查：

### 1. 检查 Vercel 日志

在 Vercel Dashboard > 项目 > Deployments > 最新部署 > Function Logs

查找以下内容：
- `🔍 Gemini serverless handler called with action: analyzePdfWithVision`
- `📄 Received X page images`
- 任何错误堆栈跟踪

### 2. 检查环境变量

确认 `GEMINI_API_KEY` 已正确设置且有效。

### 3. 检查 API 配额

确认 Gemini API 配额未超限。

### 4. 检查请求大小

如果 PDF 文件很大（>10页），可能会超过 Vercel 的请求体大小限制（4.5MB）。

**解决方案**：
- 限制最多处理 10 页（已在代码中实现）
- 或者降低图片质量/分辨率

```typescript
// 已在 utils/fileProcessors.ts 中实现
export const renderPdfPageToImage = async (
  file: File,
  pageNum: number = 1,
  scale: number = 2.0  // 如果请求太大，可以降低到 1.5
): Promise<string> => {
  // ...
}
```

## 成功标志

修复成功后，你应该看到：

1. ✅ 控制台无 400 错误
2. ✅ 成功使用 Vision 模式解析 PDF
3. ✅ 准确提取表格结构（包括水印去除）
4. ✅ 正确识别和创建占位符变量
5. ✅ 在任何网络环境都能使用 Gemini 和 OpenAI 服务

## 技术架构图

```
┌─────────────┐
│   浏览器     │
│  (客户端)   │
└──────┬──────┘
       │ 1. 上传 PDF
       │ 2. 使用 pdfjs-dist 渲染为图片
       │ 3. POST /api/gemini
       │    { action: 'analyzePdfWithVision',
       │      pageImages: ['data:image/png;base64,...', ...] }
       ▼
┌──────────────────┐
│  Vercel Edge     │
│  (CDN + Router)  │
└─────────┬────────┘
          │
          ▼
┌──────────────────┐
│ Serverless       │
│ Function         │
│ /api/gemini.ts   │
│                  │
│ - 接收 pageImages│
│ - 调用 Gemini    │
│   2.5 Flash      │
│ - 返回结果       │
└──────────────────┘
          │
          ▼
┌──────────────────┐
│  Google Gemini   │
│  Vision API      │
└──────────────────┘
```

## 后续优化建议

1. **图片压缩**：在客户端渲染时使用更智能的压缩策略
2. **分页处理**：对于超大文件，分批次处理
3. **缓存机制**：缓存已处理的文件结果
4. **错误重试**：添加自动重试逻辑
5. **进度显示**：显示处理进度给用户

## 相关文件

- [api/gemini.ts](api/gemini.ts) - Gemini serverless 函数
- [api/openai.ts](api/openai.ts) - OpenAI serverless 函数
- [services/geminiService.ts](services/geminiService.ts) - 客户端服务
- [vercel.json](vercel.json) - Vercel 配置
- [utils/fileProcessors.ts](utils/fileProcessors.ts) - PDF 渲染工具
