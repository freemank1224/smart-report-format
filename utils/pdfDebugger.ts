/**
 * PDF 解析诊断工具
 * 用于比较本地和 Vercel 环境的 PDF 文本提取差异
 */

export const debugPdfExtraction = (textContent: any, pageNum: number) => {
  const items = textContent.items.map((item: any) => {
    const [a, b, c, d, e, f] = item.transform || [];
    return {
      str: item.str || '',
      x: typeof e === 'number' ? Math.round(e * 100) / 100 : 0,
      y: typeof f === 'number' ? Math.round(f * 100) / 100 : 0,
      rawX: e,
      rawY: f
    };
  });

  // 分析坐标分布
  const yValues = items.map((item: any) => item.y).sort((a: number, b: number) => b - a);
  const uniqueYs = [...new Set(yValues)];
  const yDiffs = yValues.slice(0, -1).map((y: number, i: number) => Math.abs(y - yValues[i + 1]));
  const nonZeroDiffs = yDiffs.filter(d => d > 0.1);

  console.group(`📄 PDF Page ${pageNum} 诊断信息`);
  console.log('📊 总文本项数:', items.length);
  console.log('📏 唯一 Y 坐标数:', uniqueYs.length, '(推测行数)');
  console.log('📐 行间距范围:', {
    min: Math.min(...nonZeroDiffs).toFixed(2),
    max: Math.max(...nonZeroDiffs).toFixed(2),
    median: nonZeroDiffs.sort((a, b) => a - b)[Math.floor(nonZeroDiffs.length / 2)]?.toFixed(2)
  });
  
  // 检测可能的表格区域（多个项在相似 Y 坐标）
  const yGroups = uniqueYs.map(y => ({
    y,
    count: items.filter((item: any) => Math.abs(item.y - y) < 0.1).length
  }));
  const tableRows = yGroups.filter(g => g.count > 3);
  
  if (tableRows.length > 0) {
    console.log('🔍 检测到可能的表格区域:', tableRows.length, '行');
    console.table(tableRows.slice(0, 5));
  }
  
  console.groupEnd();

  return {
    itemCount: items.length,
    uniqueYCount: uniqueYs.length,
    yDiffStats: {
      min: Math.min(...nonZeroDiffs),
      max: Math.max(...nonZeroDiffs),
      median: nonZeroDiffs.sort((a, b) => a - b)[Math.floor(nonZeroDiffs.length / 2)]
    },
    potentialTableRows: tableRows.length,
    items: items.slice(0, 20) // 返回前 20 项供检查
  };
};

/**
 * 比较两次解析结果的差异
 */
export const comparePdfExtractions = (local: string, vercel: string) => {
  const localLines = local.split('\n').filter(l => l.trim());
  const vercelLines = vercel.split('\n').filter(l => l.trim());

  console.group('🔬 本地 vs Vercel 对比');
  console.log('本地行数:', localLines.length);
  console.log('Vercel 行数:', vercelLines.length);
  console.log('差异:', Math.abs(localLines.length - vercelLines.length), '行');

  // 查找差异行
  const maxLen = Math.max(localLines.length, vercelLines.length);
  const diffs: Array<{index: number, local?: string, vercel?: string}> = [];
  
  for (let i = 0; i < maxLen; i++) {
    if (localLines[i] !== vercelLines[i]) {
      diffs.push({
        index: i,
        local: localLines[i],
        vercel: vercelLines[i]
      });
    }
  }

  if (diffs.length > 0) {
    console.log('⚠️ 发现', diffs.length, '处差异');
    console.table(diffs.slice(0, 10));
  } else {
    console.log('✅ 两次解析完全一致');
  }
  
  console.groupEnd();

  return {
    localLines: localLines.length,
    vercelLines: vercelLines.length,
    differences: diffs.length,
    firstDiff: diffs[0] || null
  };
};

/**
 * 验证表格结构完整性
 */
export const validateTableStructure = (markdown: string) => {
  const lines = markdown.split('\n');
  const tables: Array<{start: number, headers: number, rows: number, issues: string[]}> = [];
  
  let inTable = false;
  let currentTable: any = null;
  
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('|')) {
      if (!inTable) {
        inTable = true;
        currentTable = { start: idx, headers: 0, rows: 0, issues: [], columns: 0 };
        tables.push(currentTable);
      }
      
      const cells = trimmed.split('|').filter(c => c.trim() !== '');
      
      if (trimmed.includes('---')) {
        currentTable.headers = cells.length;
      } else {
        currentTable.rows++;
        
        if (currentTable.columns === 0) {
          currentTable.columns = cells.length;
        } else if (cells.length !== currentTable.columns) {
          currentTable.issues.push(`第 ${idx + 1} 行: 期望 ${currentTable.columns} 列，实际 ${cells.length} 列`);
        }
      }
    } else if (inTable && trimmed === '') {
      inTable = false;
      currentTable = null;
    }
  });

  console.group('📋 表格结构验证');
  tables.forEach((table, i) => {
    console.log(`\n表格 ${i + 1}:`);
    console.log('  起始行:', table.start + 1);
    console.log('  列数:', table.columns || table.headers);
    console.log('  数据行数:', table.rows - 1); // 减去分隔行
    
    if (table.issues.length > 0) {
      console.warn('  ⚠️ 发现问题:', table.issues);
    } else {
      console.log('  ✅ 结构正常');
    }
  });
  console.groupEnd();

  return tables;
};
