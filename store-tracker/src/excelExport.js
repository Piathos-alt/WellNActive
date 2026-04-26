function sanitizeFileName(value) {
  return String(value || "week-export")
    .trim()
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "week-export"
}

function sanitizeWorksheetName(value) {
  return String(value || "Week Export")
    .trim()
    .replace(/[\\/?*\[\]:]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 31) || "Week Export"
}

function normalizeText(value, fallback = "-") {
  if (value === 0) return "0"
  if (value === null || value === undefined) return fallback

  const text = String(value).trim()
  return text || fallback
}

function formatDateTime(value) {
  if (!value) return "-"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return normalizeText(value)
  }

  return date.toLocaleString()
}

function getReferenceUrls(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => String(item || "").trim())
    .filter((item) => item.startsWith("http://") || item.startsWith("https://"))
}

function createBorder({ top = "thin", right = "thin", bottom = "thin", left = "thin" } = {}) {
  const makeSide = (style) => ({ style, color: { argb: "FF000000" } })

  return {
    top: makeSide(top),
    right: makeSide(right),
    bottom: makeSide(bottom),
    left: makeSide(left),
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = () => reject(new Error("Could not convert image to base64."))
    reader.readAsDataURL(blob)
  })
}

function loadImageElement(source) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Could not load image."))
    image.src = source
  })
}

function extensionFromContentType(type) {
  const normalized = String(type || "").toLowerCase()
  if (normalized.includes("png")) return "png"
  if (normalized.includes("webp")) return "webp"
  if (normalized.includes("gif")) return "gif"
  return "jpeg"
}

async function fetchImageForExcel(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Image failed (${response.status})`)
  }

  const blob = await response.blob()
  const base64 = await blobToDataUrl(blob)

  return {
    base64,
    extension: extensionFromContentType(blob.type),
  }
}

async function createVisitReferenceComposite(imageSources) {
  const count = imageSources.length
  const columns = count === 1 ? 1 : 2
  const rows = Math.ceil(count / columns)
  const gap = 8
  const slotWidth = columns === 1 ? 248 : 132
  const slotHeight = columns === 1 ? 156 : 108
  const canvasWidth = columns * slotWidth + (columns + 1) * gap
  const canvasHeight = rows * slotHeight + (rows + 1) * gap

  const canvas = document.createElement("canvas")
  canvas.width = canvasWidth
  canvas.height = canvasHeight

  const ctx = canvas.getContext("2d")
  if (!ctx) {
    throw new Error("Could not prepare image canvas.")
  }

  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  const loadedImages = await Promise.all(imageSources.map((source) => loadImageElement(source)))

  loadedImages.forEach((image, index) => {
    const row = Math.floor(index / columns)
    const column = index % columns
    const frameX = gap + column * (slotWidth + gap)
    const frameY = gap + row * (slotHeight + gap)

    ctx.fillStyle = "#f8fafc"
    ctx.fillRect(frameX, frameY, slotWidth, slotHeight)
    ctx.strokeStyle = "#cbd5e1"
    ctx.lineWidth = 1
    ctx.strokeRect(frameX, frameY, slotWidth, slotHeight)

    const scale = Math.min((slotWidth - 12) / image.width, (slotHeight - 12) / image.height, 1)
    const drawWidth = image.width * scale
    const drawHeight = image.height * scale
    const drawX = frameX + (slotWidth - drawWidth) / 2
    const drawY = frameY + (slotHeight - drawHeight) / 2

    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight)
  })

  return {
    base64: canvas.toDataURL("image/jpeg", 0.9),
    width: canvasWidth,
    height: canvasHeight,
  }
}

export async function exportWeekToExcel(expandedWeekLabel, expandedWeekEntries, setModalError, setIsExporting) {
  if (!Array.isArray(expandedWeekEntries) || !expandedWeekEntries.length) {
    setModalError("There is no week data loaded to export.")
    return
  }

  setIsExporting(true)

  try {
    const { default: ExcelJS } = await import("exceljs")
    const workbook = new ExcelJS.Workbook()
    workbook.creator = "WellNActive"
    workbook.created = new Date()
    workbook.modified = new Date()

    const worksheet = workbook.addWorksheet(sanitizeWorksheetName(expandedWeekLabel || "Week Export"), {
      properties: { defaultRowHeight: 18 },
      views: [{ state: "frozen", ySplit: 1 }],
    })

    const columns = [
      { header: "Date", key: "visit_date", width: 14 },
      { header: "Store Code", key: "store_code", width: 14 },
      { header: "Branch Name", key: "branch_name", width: 30 },
      { header: "SKU", key: "sku_name", width: 22 },
      { header: "Stock Status", key: "stock_status", width: 16 },
      { header: "Stock Quantity", key: "stock_quantity", width: 16 },
      { header: "SKU POG Status", key: "sku_pog_status", width: 16 },
      { header: "Store POG Status", key: "pog_status", width: 16 },
      { header: "Visit Reference", key: "visit_reference_urls", width: 60 },
    ]

    worksheet.columns = columns

    const headerRow = worksheet.getRow(1)
    headerRow.height = 22
    headerRow.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } }
    headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F4E78" },
    }
    headerRow.eachCell((cell) => {
      cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } }
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
      cell.border = createBorder({ top: "medium", right: "medium", bottom: "medium", left: "medium" })
    })

    const mergedGroups = []
    const outOfStockRowIndexes = []

    for (const { entry, rows } of expandedWeekEntries) {
      const skuRows = Array.isArray(rows) && rows.length
        ? rows
        : [{ sku_name: "-", stock_status: "-", stock_quantity: "-", sku_pog_status: "-" }]

      const startRow = worksheet.rowCount + 1
      const visitReferenceUrls = getReferenceUrls(entry?.visit_reference_urls)

      for (const skuRow of skuRows) {
        const addedRow = worksheet.addRow({
          visit_date: normalizeText(entry?.visit_date),
          store_code: normalizeText(entry?.store_code),
          branch_name: normalizeText(entry?.branch_name),
          sku_name: normalizeText(skuRow?.sku_name),
          stock_status: normalizeText(skuRow?.stock_status),
          stock_quantity: normalizeText(skuRow?.stock_quantity),
          sku_pog_status: normalizeText(skuRow?.sku_pog_status),
          pog_status: normalizeText(entry?.pog_status),
          visit_reference_urls: "",
        })

        if (String(skuRow?.stock_status || "").trim().toLowerCase() === "out of stock") {
          outOfStockRowIndexes.push(addedRow.number)
        }
      }

      mergedGroups.push({
        startRow,
        endRow: worksheet.rowCount,
        visitReferenceUrls,
      })
    }

    worksheet.eachRow((row, rowNumber) => {
      row.font = { name: "Calibri", size: 10, color: { argb: "FF1F1F1F" } }
      row.alignment = { vertical: "middle", horizontal: "left", wrapText: true }

      if (rowNumber === 1) {
        return
      }

      row.eachCell((cell, columnNumber) => {
        if ([4, 5, 6, 7].includes(columnNumber)) {
          cell.border = createBorder({ top: "none", bottom: "none" })
          return
        }

        cell.border = createBorder()
      })
    })

    for (const group of mergedGroups) {
      if (group.endRow <= group.startRow) {
        continue
      }

      for (const columnIndex of [1, 2, 3, 8, 9]) {
        worksheet.mergeCells(group.startRow, columnIndex, group.endRow, columnIndex)
      }

      worksheet.getRow(group.startRow).alignment = { vertical: "middle", horizontal: "left", wrapText: true }

      for (let rowIndex = group.startRow; rowIndex <= group.endRow; rowIndex += 1) {
        for (let columnIndex = 1; columnIndex <= columns.length; columnIndex += 1) {
          const cell = worksheet.getCell(rowIndex, columnIndex)
          const isTopRow = rowIndex === group.startRow
          const isBottomRow = rowIndex === group.endRow
          const isFirstColumn = columnIndex === 1
          const isLastColumn = columnIndex === columns.length
          const isSkuBlockColumn = [4, 5, 6, 7].includes(columnIndex)

          cell.border = createBorder({
            top: isSkuBlockColumn ? "none" : (isTopRow ? "medium" : "thin"),
            right: isLastColumn ? "medium" : "thin",
            bottom: isSkuBlockColumn ? (isBottomRow ? "medium" : "none") : (isBottomRow ? "medium" : "thin"),
            left: isFirstColumn ? "medium" : "thin",
          })
        }
      }

      const referenceCell = worksheet.getCell(group.startRow, 9)
      referenceCell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }

      const referenceUrls = Array.isArray(group.visitReferenceUrls) ? group.visitReferenceUrls : []

      if (!referenceUrls.length) {
        referenceCell.value = "No reference"
        continue
      }

      try {
        const fetched = await Promise.allSettled(referenceUrls.map(fetchImageForExcel))
        const imageSources = fetched
          .filter((result) => result.status === "fulfilled")
          .map((result) => result.value.base64)

        if (!imageSources.length) {
          throw new Error("No images could be loaded.")
        }

        const composite = await createVisitReferenceComposite(imageSources)
        const imageId = workbook.addImage({
          base64: composite.base64,
          extension: "jpeg",
        })

        const rowCount = Math.max(1, group.endRow - group.startRow + 1)
        const totalRowHeight = Math.max(72, Math.ceil(composite.height * 0.75))
        const perRowHeight = Math.max(18, Math.ceil(totalRowHeight / rowCount))

        for (let rowIndex = group.startRow; rowIndex <= group.endRow; rowIndex += 1) {
          worksheet.getRow(rowIndex).height = perRowHeight
        }

        referenceCell.value = null

        worksheet.addImage(imageId, {
          tl: { col: 8.08, row: group.startRow - 1 + 0.08 },
          ext: {
            width: composite.width,
            height: composite.height,
          },
          editAs: "oneCell",
        })
      } catch {
        referenceCell.value = "Image unavailable"
      }
    }

    for (const rowIndex of outOfStockRowIndexes) {
      for (const columnIndex of [4, 5, 6, 7]) {
        const cell = worksheet.getCell(rowIndex, columnIndex)
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFD32F2F" },
        }
        cell.font = {
          name: "Calibri",
          size: 10,
          bold: true,
          color: { argb: "FFFFFFFF" },
        }
      }
    }

    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${sanitizeFileName(expandedWeekLabel || "week-export")}.xlsx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch (error) {
    setModalError(error?.message || "Could not export Excel file.")
  } finally {
    setIsExporting(false)
  }
}