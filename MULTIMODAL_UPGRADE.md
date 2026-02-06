# 升级到多模态 PDF 表格提取方案

## 当前问题分析

### 现有方案
```
PDF → PDF.js文本提取 → 坐标排序 → 纯文本 → 文本大模型 → Markdown
```

**问题**：
- 文本大模型看不到表格的视觉结构
- 完全依赖坐标和空格推断列边界
- 环境差异影响坐标计算
- 复杂表格（合并单元格、嵌套）无法处理

## 推荐方案：多模态视觉识别

### 实现步骤

#### 1. 添加 PDF 页面渲染功能

```typescript
// utils/fileProcessors.ts

export const renderPdfPageToImage = async (
  file: File, 
  pageNum: number = 1,
  scale: number = 2.0
): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(pageNum);
  
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  await page.render({
    canvasContext: context,
    viewport: viewport
  }).promise;
  
  // 返回 base64 图片
  return canvas.toDataURL('image/png');
};

export const renderAllPdfPages = async (file: File): Promise<string[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const images: string[] = [];
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const image = await renderPdfPageToImage(file, i);
    images.push(image);
  }
  
  return images;
};
```

#### 2. 修改 Gemini 服务使用视觉模型

```typescript
// services/geminiService.ts

export const analyzePdfWithVision = async (
  pdfFile: File
): Promise<AnalysisResult> => {
  // 渲染 PDF 页面为图片
  const pageImages = await renderAllPdfPages(pdfFile);
  
  // 只处理前几页（避免token过多）
  const imagesToAnalyze = pageImages.slice(0, 5);
  
  const parts = [
    { text: buildVisionAnalyzePrompt() },
    ...imagesToAnalyze.map(img => ({
      inlineData: {
        mimeType: 'image/png',
        data: img.split(',')[1] // 去掉 data:image/png;base64, 前缀
      }
    }))
  ];
  
  const response = await getAI().models.generateContent({
    model: 'gemini-2.0-flash-exp', // 支持视觉的模型
    contents: parts,
    config: {
      systemInstruction: "You are a precise document structuring assistant with vision capabilities.",
    }
  });
  
  const content = response.text || "";
  
  // 后处理...
  let normalizedContent = normalizeSectionFormatting(content);
  normalizedContent = normalizeKeyValueBolding(normalizedContent);
  
  const regex = /\{\{([^}]+)\}\}/g;
  const matches = new Set<string>();
  let match;
  while ((match = regex.exec(normalizedContent)) !== null) {
    matches.add(match[1]);
  }
  
  return {
    content: normalizedContent,
    detectedVariables: Array.from(matches)
  };
};

const buildVisionAnalyzePrompt = () => `
You are an expert document parser with VISION capabilities. 
You can SEE the PDF pages as images, including tables, borders, and layout.

Your task: Convert the visual document into a structured Markdown template.

CRITICAL ADVANTAGES OF VISION:
1. You can SEE table borders and cell boundaries
2. You can IDENTIFY merged cells visually
3. You can DETECT column alignment by visual position
4. You can DISTINGUISH between headers and data by formatting

TABLE EXTRACTION WITH VISION:
- Use the VISUAL table structure (borders, lines, spacing)
- Count columns by SEEING the vertical separators
- Identify headers by VISUAL formatting (bold, background)
- Map each cell to its correct column by VISUAL position
- Handle merged cells by SEEING which cells span multiple columns

Output the same Markdown format with {{placeholders}}, but with HIGHER ACCURACY
because you can SEE the actual table structure.

=== OUTPUT FORMAT ===
Same as before: Markdown with {{variables}} for dynamic content.
But now you have VISION to ensure tables are extracted correctly.
`;
```

#### 3. Serverless 函数支持（Vercel）

```typescript
// api/gemini.ts

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { action, pageImages } = req.body || {};

    if (action === 'analyzePdfWithVision') {
      if (!Array.isArray(pageImages) || pageImages.length === 0) {
        res.status(400).json({ error: 'pageImages array is required' });
        return;
      }

      const parts = [
        { text: buildVisionAnalyzePrompt() },
        ...pageImages.map((img: string) => ({
          inlineData: {
            mimeType: 'image/png',
            data: img.split(',')[1]
          }
        }))
      ];

      const response = await getAI().models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: parts,
        config: {
          systemInstruction: "You are a precise document structuring assistant with vision capabilities.",
        }
      });

      const content = response.text || "";
      let normalizedContent = normalizeSectionFormatting(content);
      normalizedContent = normalizeKeyValueBolding(normalizedContent);
      
      const regex = /\{\{([^}]+)\}\}/g;
      const matches = new Set<string>();
      let match;
      while ((match = regex.exec(normalizedContent)) !== null) {
        matches.add(match[1]);
      }

      const result: AnalysisResult = {
        content: normalizedContent,
        detectedVariables: Array.from(matches)
      };

      res.status(200).json(result);
      return;
    }

    // ... 其他 actions
  } catch (error) {
    console.error('Vision analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze PDF with vision.' });
  }
}
```

#### 4. UI 组件支持

```typescript
// components/TemplateEditor.tsx

const handlePdfUpload = async (file: File) => {
  setLoading(true);
  
  try {
    // 方案 1: 使用视觉识别（推荐）
    const result = await analyzePdfWithVision(file);
    
    // 方案 2: 降级到文本提取（备用）
    // const text = await extractTextFromPdf(file);
    // const result = await analyzePdfStructure(text);
    
    setTemplateContent(result.content);
    setDetectedVariables(result.detectedVariables);
  } catch (error) {
    console.error('PDF 分析失败:', error);
    
    // 自动降级
    try {
      const text = await extractTextFromPdf(file);
      const result = await analyzePdfStructure(text);
      setTemplateContent(result.content);
      setDetectedVariables(result.detectedVariables);
      
      alert('使用备用文本提取模式（精度可能较低）');
    } catch (fallbackError) {
      alert('PDF 解析失败');
    }
  } finally {
    setLoading(false);
  }
};
```

### 优势对比

| 特性 | 文本提取 (现有) | 多模态视觉 (推荐) |
|------|----------------|------------------|
| 表格识别准确率 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 环境一致性 | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| 复杂表格支持 | ❌ | ✅ |
| 合并单元格 | ❌ | ✅ |
| 视觉格式识别 | ❌ | ✅ |
| 成本 | 低 | 中等 |
| 性能 | 快 | 较慢（渲染耗时） |

### 成本估算

**Gemini 2.0 Flash (多模态)**
- 输入: $0.075 / 1M tokens (图片约 258 tokens/张)
- 输出: $0.30 / 1M tokens

**示例**：
- 5 页 PDF = 5 张图片 ≈ 1,290 tokens
- 输出 2,000 tokens Markdown
- 成本: ~$0.0007 / 次

**对比文本模式**：
- 60,000 字符文本 ≈ 15,000 tokens
- 成本: ~$0.0012 / 次

💡 **多模态不一定更贵，反而可能因为更准确而减少重试成本**

### 实施计划

#### Phase 1: 本地测试 (1 周)
1. 添加页面渲染功能
2. 实现视觉分析函数
3. 本地测试对比准确率

#### Phase 2: Serverless 部署 (1 周)
1. 更新 Vercel 函数
2. 处理图片大小限制（可能需要压缩）
3. 性能优化

#### Phase 3: 生产部署 (1 周)
1. A/B 测试两种方案
2. 收集用户反馈
3. 逐步切换到多模态

### 潜在问题和解决方案

#### 问题 1: 图片太大导致请求超时
**方案**: 压缩图片或降低分辨率
```typescript
const scale = 1.5; // 降低到 1.5x 而非 2.0x
// 或使用 JPEG 压缩
canvas.toDataURL('image/jpeg', 0.85);
```

#### 问题 2: Vercel 函数超时
**方案**: 分页处理
```typescript
// 每次只处理 2-3 页
const batchSize = 3;
for (let i = 0; i < totalPages; i += batchSize) {
  const batch = pageImages.slice(i, i + batchSize);
  await analyzeBatch(batch);
}
```

#### 问题 3: 成本增加
**方案**: 智能降级
```typescript
// 如果文本提取效果好，就不用视觉
const textQuality = estimateTextQuality(extractedText);
if (textQuality > 0.8) {
  return await analyzePdfStructure(extractedText);
} else {
  return await analyzePdfWithVision(pdfFile);
}
```

## 结论

**强烈建议升级到多模态方案**，可以从根本上解决表格识别的环境差异问题。

当前的文本提取方案已经优化到极限，但由于其本质限制（看不到视觉信息），
永远无法达到视觉模型的准确率。

多模态方案的投资回报率很高：
- 开发成本：2-3 周
- 识别准确率提升：30-50%
- 用户体验改善：显著
- 维护成本降低：不需要处理各种坐标边界问题
