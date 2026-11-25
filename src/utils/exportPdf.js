// PDF 导出工具（S7 重构新增）：把页面里的 DOM 区域渲染成图片，再按 A4 分页写成 PDF
// 说明：中文无需嵌入字体——html2canvas 先把 DOM 画成位图，jsPDF 只负责把图片放进 PDF 页面，
//       因此不会遇到 jsPDF 默认字体不支持中文的问题。
// 依赖按需动态导入：只有用户点「导出 PDF」时才加载 html2canvas / jsPDF，不拖慢首屏。

/**
 * 把指定元素导出为 PDF 文件（A4 纵向，自动分页）
 * @param {HTMLElement} element 要导出的 DOM 元素（页面里的离屏打印区域）
 * @param {string} [filename] 下载文件名，默认 '清单.pdf'
 * @returns {Promise<void>}
 */
export async function exportElementToPdf(element, filename = '清单.pdf') {
  if (!element) throw new Error('缺少导出内容')

  // 动态导入：Vite 会为这两个依赖单独分包，点击导出时才下载
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  // 1. 先把打印区域渲染成 2 倍像素的图片，保证 PDF 里文字清晰
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  })
  const imageData = canvas.toDataURL('image/jpeg', 0.92)

  // 2. 按 A4 尺寸计算图片宽度；高度按图片比例缩放
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageWidth = 210
  const pageHeight = 297
  const margin = 10
  const contentWidth = pageWidth - margin * 2
  const contentHeight = pageHeight - margin * 2
  const imageHeight = (canvas.height * contentWidth) / canvas.width

  // 3. 第一页：从页边距开始放整张图（超出的部分后续用负偏移补页）
  pdf.addImage(imageData, 'JPEG', margin, margin, contentWidth, imageHeight)

  // 4. 多页：每页把同一张图向上偏移一页内容高度，形成"截取下一页"的效果
  let offset = contentHeight
  while (offset < imageHeight) {
    pdf.addPage()
    pdf.addImage(imageData, 'JPEG', margin, margin - offset, contentWidth, imageHeight)
    offset += contentHeight
  }

  // 5. 触发浏览器下载
  pdf.save(filename)
}
