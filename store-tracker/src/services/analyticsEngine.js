import { supabase } from "../supabaseClient"

const SUPPORTED_INTENTS = {
  MOST_VISITED_BRANCH: "MOST_VISITED_BRANCH",
  OOS_SKUS: "OOS_SKUS",
  POG_COMPLIANCE: "POG_COMPLIANCE",
  WEEKLY_SUMMARY: "WEEKLY_SUMMARY",
}

function sanitizeMessage(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 500)
}

function normalizeLabel(value, fallback = "Unassigned") {
  const text = String(value || "").trim()
  return text || fallback
}

function sortByCountDescThenLabelAsc(left, right) {
  if (right.count !== left.count) {
    return right.count - left.count
  }

  return left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: "base" })
}

function parseWeekLabel(label) {
  const text = String(label || "").trim()
  if (!text) {
    return null
  }

  const match = text.match(/week\s*(\d+)/i)
  if (match) {
    return {
      sortKey: Number.parseInt(match[1], 10),
      label: text,
    }
  }

  return {
    sortKey: Number.POSITIVE_INFINITY,
    label: text,
  }
}

function getWeekSortValue(label) {
  const parsed = parseWeekLabel(label)
  return parsed ? parsed.sortKey : Number.POSITIVE_INFINITY
}

function getDistinctWeeks(entries) {
  return Array.from(new Set((entries || []).map((entry) => normalizeLabel(entry.week_label, "")).filter(Boolean)))
    .sort((left, right) => {
      const leftSortValue = getWeekSortValue(left)
      const rightSortValue = getWeekSortValue(right)

      if (leftSortValue !== rightSortValue) {
        return leftSortValue - rightSortValue
      }

      return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })
    })
}

function buildResponse({ intent, title, explanation, results, insight }) {
  return {
    intent,
    title,
    explanation,
    results,
    insight,
  }
}

async function fetchVisitEntries() {
  const { data, error } = await supabase
    .from("visit_entries")
    .select("id, week_label, visit_date, store_code, branch_name, pog_status, created_at")

  if (error) {
    throw new Error(error.message)
  }

  return Array.isArray(data) ? data : []
}

async function fetchVisitEntrySkus() {
  const { data, error } = await supabase
    .from("visit_entry_skus")
    .select("visit_entry_id, sku_name, stock_status, stock_quantity, sku_pog_status")

  if (error) {
    throw new Error(error.message)
  }

  return Array.isArray(data) ? data : []
}

async function fetchBranches() {
  const { data, error } = await supabase
    .from("branch_masterlist")
    .select("code, branch_name")

  if (error) {
    throw new Error(error.message)
  }

  return Array.isArray(data) ? data : []
}

function mapBranchLabels(entries, branches) {
  const branchLookup = new Map(
    (branches || []).map((branch) => [String(branch.code || "").trim(), normalizeLabel(branch.branch_name)]),
  )

  return (entries || []).map((entry) => ({
    ...entry,
    branch_label: normalizeLabel(entry.branch_name || branchLookup.get(String(entry.store_code || "").trim())),
  }))
}

function buildMostVisitedBranchResponse(entries, branches) {
  const labeledEntries = mapBranchLabels(entries, branches)
  const grouped = new Map()

  for (const entry of labeledEntries) {
    const label = normalizeLabel(entry.branch_label)
    const code = normalizeLabel(entry.store_code, "-")
    const key = `${code}::${label}`
    const current = grouped.get(key) || {
      label,
      code,
      count: 0,
    }

    current.count += 1
    grouped.set(key, current)
  }

  const ranked = Array.from(grouped.values()).sort(sortByCountDescThenLabelAsc).slice(0, 5)

  return buildResponse({
    intent: SUPPORTED_INTENTS.MOST_VISITED_BRANCH,
    title: "Most Visited Branches",
    explanation: "Branch visit activity ranked from highest to lowest across the available records.",
    results: ranked.map((item, index) => ({
      rank: index + 1,
      label: item.label,
      value: `${item.count} visits`,
      detail: item.code !== "-" ? `Store code ${item.code}` : undefined,
    })),
    insight: ranked.length
      ? `${ranked[0].label} consistently leads in visit activity.`
      : "No visit records were available to rank.",
  })
}

function buildOutOfStockSkuResponse(entries, skuRows, branches) {
  const branchLabelByEntryId = new Map(
    mapBranchLabels(entries, branches).map((entry) => [String(entry.id), normalizeLabel(entry.branch_label)]),
  )

  const grouped = new Map()

  for (const row of skuRows) {
    const isOutOfStock = String(row.stock_status || "").trim().toLowerCase() === "out of stock"
    if (!isOutOfStock) {
      continue
    }

    const skuName = normalizeLabel(row.sku_name)
    const branchLabel = branchLabelByEntryId.get(String(row.visit_entry_id)) || "Unassigned"
    const key = skuName
    const current = grouped.get(key) || {
      label: skuName,
      count: 0,
      branches: new Set(),
    }

    current.count += 1
    current.branches.add(branchLabel)
    grouped.set(key, current)
  }

  const ranked = Array.from(grouped.values())
    .map((item) => ({
      label: item.label,
      count: item.count,
      detail: `${item.branches.size} branch${item.branches.size === 1 ? "" : "es"} affected`,
    }))
    .sort(sortByCountDescThenLabelAsc)
    .slice(0, 5)

  return buildResponse({
    intent: SUPPORTED_INTENTS.OOS_SKUS,
    title: "Out of Stock SKUs",
    explanation: "SKU rows marked as out of stock, ranked by how often they appear in the database.",
    results: ranked.map((item, index) => ({
      rank: index + 1,
      label: item.label,
      value: `${item.count} out-of-stock checks`,
      detail: item.detail,
    })),
    insight: ranked.length
      ? `${ranked[0].label} is the most frequent out-of-stock SKU in the current dataset.`
      : "No out-of-stock SKU rows were found.",
  })
}

function buildPogComplianceResponse(entries, skuRows, branches) {
  const branchLabelByEntryId = new Map(
    mapBranchLabels(entries, branches).map((entry) => [String(entry.id), normalizeLabel(entry.branch_label)]),
  )

  const grouped = new Map()

  for (const row of skuRows) {
    const branchLabel = branchLabelByEntryId.get(String(row.visit_entry_id)) || "Unassigned"
    const current = grouped.get(branchLabel) || {
      label: branchLabel,
      compliantCount: 0,
      totalCount: 0,
    }

    current.totalCount += 1
    if (String(row.sku_pog_status || "").trim().toUpperCase() === "POG") {
      current.compliantCount += 1
    }

    grouped.set(branchLabel, current)
  }

  const ranked = Array.from(grouped.values())
    .map((item) => ({
      label: item.label,
      count: item.totalCount,
      complianceRate: item.totalCount ? Math.round((item.compliantCount / item.totalCount) * 100) : 0,
      detail: `${item.compliantCount}/${item.totalCount} SKU rows compliant`,
    }))
    .sort((left, right) => {
      if (right.complianceRate !== left.complianceRate) {
        return right.complianceRate - left.complianceRate
      }

      if (right.count !== left.count) {
        return right.count - left.count
      }

      return left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: "base" })
    })
    .slice(0, 5)

  return buildResponse({
    intent: SUPPORTED_INTENTS.POG_COMPLIANCE,
    title: "POG Compliance per Branch",
    explanation: "Branch-level SKU compliance based on the SKU POG status stored in the database.",
    results: ranked.map((item, index) => ({
      rank: index + 1,
      label: item.label,
      value: `${item.complianceRate}% compliant`,
      detail: item.detail,
    })),
    insight: ranked.length
      ? `${ranked[0].label} currently shows the strongest SKU-level POG compliance.`
      : "No SKU POG records were available for compliance scoring.",
  })
}

function buildWeeklySummaryResponse(entries, skuRows, branches) {
  const labeledEntries = mapBranchLabels(entries, branches)
  const weeks = getDistinctWeeks(labeledEntries)

  if (!weeks.length) {
    return buildResponse({
      intent: SUPPORTED_INTENTS.WEEKLY_SUMMARY,
      title: "Weekly Summary Comparison",
      explanation: "No week labels were available to compare.",
      results: [],
      insight: "Add week-labeled visit entries to enable weekly comparisons.",
    })
  }

  const weekMetrics = weeks.map((weekLabel) => {
    const weekEntries = labeledEntries.filter((entry) => normalizeLabel(entry.week_label, "") === weekLabel)
    const entryIds = new Set(weekEntries.map((entry) => String(entry.id)))
    const weekSkuRows = skuRows.filter((row) => entryIds.has(String(row.visit_entry_id)))

    const oosCount = weekSkuRows.filter((row) => String(row.stock_status || "").trim().toLowerCase() === "out of stock").length
    const pogCompliantCount = weekSkuRows.filter((row) => String(row.sku_pog_status || "").trim().toUpperCase() === "POG").length

    return {
      label: weekLabel,
      visitCount: weekEntries.length,
      branchCount: new Set(weekEntries.map((entry) => normalizeLabel(entry.branch_label))).size,
      oosCount,
      pogComplianceRate: weekSkuRows.length ? Math.round((pogCompliantCount / weekSkuRows.length) * 100) : 0,
    }
  })

  const latestWeeks = weekMetrics.slice(-2)
  const ranked = [...latestWeeks].reverse().map((week) => ({
    label: week.label,
    value: `${week.visitCount} visits, ${week.branchCount} branches`,
    detail: `${week.oosCount} out-of-stock SKU checks, ${week.pogComplianceRate}% SKU POG compliance`,
  }))

  let insight = `${weekMetrics[weekMetrics.length - 1].label} is the most recent week in the dataset.`
  if (weekMetrics.length >= 2) {
    const previousWeek = weekMetrics[weekMetrics.length - 2]
    const latestWeek = weekMetrics[weekMetrics.length - 1]
    const visitDelta = latestWeek.visitCount - previousWeek.visitCount
    const oosDelta = latestWeek.oosCount - previousWeek.oosCount
    const pogDelta = latestWeek.pogComplianceRate - previousWeek.pogComplianceRate

    insight = `${latestWeek.label} vs ${previousWeek.label}: visits ${visitDelta >= 0 ? "+" : ""}${visitDelta}, OOS checks ${oosDelta >= 0 ? "+" : ""}${oosDelta}, POG compliance ${pogDelta >= 0 ? "+" : ""}${pogDelta} points.`
  }

  return buildResponse({
    intent: SUPPORTED_INTENTS.WEEKLY_SUMMARY,
    title: "Weekly Summary Comparison",
    explanation: "The two most recent week groups are compared using visit volume, OOS checks, and SKU POG compliance.",
    results: ranked,
    insight,
  })
}

export function detectAnalyticsIntent(message) {
  const text = sanitizeMessage(message).toLowerCase()

  if (!text) {
    return null
  }

  if (text.includes("most visited") || text.includes("top branch") || text.includes("top branches")) {
    return SUPPORTED_INTENTS.MOST_VISITED_BRANCH
  }

  if (text.includes("out of stock") || text.includes("oos")) {
    return SUPPORTED_INTENTS.OOS_SKUS
  }

  if (text.includes("weekly") || text.includes("this week") || text.includes("last week") || text.includes("compare") || text.includes("comparison")) {
    return SUPPORTED_INTENTS.WEEKLY_SUMMARY
  }

  if (text.includes("pog")) {
    return SUPPORTED_INTENTS.POG_COMPLIANCE
  }

  return null
}

export async function analyzeAnalyticsMessage(message) {
  const sanitizedMessage = sanitizeMessage(message)
  const intent = detectAnalyticsIntent(sanitizedMessage)

  if (!intent) {
    return buildResponse({
      intent: "UNSUPPORTED",
      title: "Supported Analytics Topics",
      explanation: "I can answer deterministic operations analytics questions only.",
      results: [
        { rank: 1, label: "Most visited branch", value: "Ask for branch activity rankings" },
        { rank: 2, label: "Out of stock SKUs", value: "Ask for SKU stock issues" },
        { rank: 3, label: "POG compliance", value: "Ask for branch-level compliance" },
        { rank: 4, label: "Weekly summary", value: "Ask for week comparisons" },
      ],
      insight: "Use one of the supported analytics topics to get a database-backed answer.",
    })
  }

  const [entries, skuRows, branches] = await Promise.all([
    fetchVisitEntries(),
    fetchVisitEntrySkus(),
    fetchBranches(),
  ])

  switch (intent) {
    case SUPPORTED_INTENTS.MOST_VISITED_BRANCH:
      return buildMostVisitedBranchResponse(entries, branches)
    case SUPPORTED_INTENTS.OOS_SKUS:
      return buildOutOfStockSkuResponse(entries, skuRows, branches)
    case SUPPORTED_INTENTS.POG_COMPLIANCE:
      return buildPogComplianceResponse(entries, skuRows, branches)
    case SUPPORTED_INTENTS.WEEKLY_SUMMARY:
      return buildWeeklySummaryResponse(entries, skuRows, branches)
    default:
      return buildResponse({
        intent: "UNSUPPORTED",
        title: "Supported Analytics Topics",
        explanation: "I can answer deterministic operations analytics questions only.",
        results: [],
        insight: "Use one of the supported analytics topics to get a database-backed answer.",
      })
  }
}

export async function getMostVisitedBranches() {
  const [entries, branches] = await Promise.all([fetchVisitEntries(), fetchBranches()])
  return buildMostVisitedBranchResponse(entries, branches)
}

export async function getOutOfStockSKUs() {
  const [entries, skuRows, branches] = await Promise.all([fetchVisitEntries(), fetchVisitEntrySkus(), fetchBranches()])
  return buildOutOfStockSkuResponse(entries, skuRows, branches)
}

export async function getPOGCompliance() {
  const [entries, skuRows, branches] = await Promise.all([fetchVisitEntries(), fetchVisitEntrySkus(), fetchBranches()])
  return buildPogComplianceResponse(entries, skuRows, branches)
}

export async function getWeeklySummary() {
  const [entries, skuRows, branches] = await Promise.all([fetchVisitEntries(), fetchVisitEntrySkus(), fetchBranches()])
  return buildWeeklySummaryResponse(entries, skuRows, branches)
}
