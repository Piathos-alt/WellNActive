import { useEffect, useState } from "react"
import { supabase } from "./supabaseClient"
import "./App.css"

const SKU_ITEMS = ["Neck & Shoulder", "Menstrual", "Back", "Knee & Joint"]
const STOCK_OPTIONS = ["With Stock", "Low Stock", "Out of Stock"]

function createInitialSkuState() {
  return SKU_ITEMS.reduce((accumulator, sku) => {
    accumulator[sku] = {
      status: "With Stock",
      quantity: "",
    }
    return accumulator
  }, {})
}

function App() {
  const [branches, setBranches] = useState([])
  const [savedForms, setSavedForms] = useState([])
  const [selectedSavedFormId, setSelectedSavedFormId] = useState("")
  const [weekLabel, setWeekLabel] = useState("Week 1")
  const [selectedStoreCode, setSelectedStoreCode] = useState("")
  const [branchName, setBranchName] = useState("")
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10))
  const [pogStatus, setPogStatus] = useState("")
  const [skuStock, setSkuStock] = useState(createInitialSkuState)
  const [visitPhotos, setVisitPhotos] = useState([])
  const [existingVisitReferences, setExistingVisitReferences] = useState([])
  const [branchLoading, setBranchLoading] = useState(true)
  const [branchError, setBranchError] = useState("")
  const [savedFormsLoading, setSavedFormsLoading] = useState(true)
  const [savedFormsError, setSavedFormsError] = useState("")
  const [lastUpdated, setLastUpdated] = useState(null)
  const [savedFormsLastUpdated, setSavedFormsLastUpdated] = useState(null)
  const [formMessage, setFormMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingFormId, setDeletingFormId] = useState("")
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [expandedWeekLabel, setExpandedWeekLabel] = useState("")
  const [expandedWeekEntries, setExpandedWeekEntries] = useState([])
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState("")
  const [isExporting, setIsExporting] = useState(false)

  useEffect(() => {
    fetchBranches()
    fetchSavedForms()
  }, [])

  useEffect(() => {
    if (!selectedStoreCode) {
      setBranchName("")
      return
    }

    const selectedBranch = branches.find((branch) => branch.code === selectedStoreCode)
    if (selectedBranch?.name) {
      setBranchName(selectedBranch.name)
    }
  }, [branches, selectedStoreCode])

  async function fetchBranches() {
    setBranchLoading(true)
    setBranchError("")

    const { data, error: fetchError } = await supabase
      .from("branch_masterlist")
      .select("code, branch_name")
      .order("code", { ascending: true })

    if (fetchError) {
      setBranchError(fetchError.message)
      setBranches([])
      setSelectedStoreCode("")
      setBranchName("")
      setBranchLoading(false)
      return
    }

    const mapped = (data || [])
      .map((row) => {
        const code = String(row.code ?? "").trim()
        const name = String(row.branch_name ?? "").trim()
        return { code, name }
      })
      .filter((branch) => Boolean(branch.code))

    setBranches(mapped)
    setLastUpdated(new Date())
    setBranchLoading(false)
  }

  async function fetchSavedForms() {
    setSavedFormsLoading(true)
    setSavedFormsError("")

    let { data, error: fetchError } = await supabase
      .from("visit_entries")
      .select("id, week_label, visit_date, store_code, branch_name, pog_status, visit_reference_urls, created_at")
      .order("created_at", { ascending: false })

    if (fetchError?.code === "42703") {
      const fallbackResult = await supabase
        .from("visit_entries")
        .select("id, visit_date, store_code, branch_name, pog_status, visit_reference_urls, created_at")
        .order("created_at", { ascending: false })

      data = (fallbackResult.data || []).map((entry) => ({
        ...entry,
        week_label: "Unassigned",
      }))
      fetchError = fallbackResult.error
    }

    if (fetchError) {
      setSavedFormsError(fetchError.message)
      setSavedForms([])
      setSavedFormsLoading(false)
      return
    }

    setSavedForms(data || [])
    setSavedFormsLastUpdated(new Date())
    setSavedFormsLoading(false)
  }

  function handleStoreCodeChange(event) {
    const selectedCode = event.target.value
    setSelectedStoreCode(selectedCode)
    setSelectedSavedFormId("")
    setFormMessage("")
  }

  function handleSkuFieldChange(sku, field, value) {
    setSkuStock((currentStock) => ({
      ...currentStock,
      [sku]: {
        ...currentStock[sku],
        [field]: value,
        ...(field === "status" && value === "Out of Stock" ? { quantity: "0" } : {}),
      },
    }))
    setFormMessage("")
  }

  function handleVisitPhotoChange(event) {
    const selectedFiles = Array.from(event.target.files || [])
    setVisitPhotos(selectedFiles)
    setFormMessage("")
  }

  function resetForm() {
    setWeekLabel("Week 1")
    setVisitDate(new Date().toISOString().slice(0, 10))
    setSelectedSavedFormId("")
    setSelectedStoreCode("")
    setBranchName("")
    setPogStatus("")
    setSkuStock(createInitialSkuState())
    setVisitPhotos([])
    setExistingVisitReferences([])
    setFormMessage("")
  }

  async function loadSavedForm(entry) {
    setFormMessage("Loading saved form...")

    const { data, error: skuError } = await supabase
      .from("visit_entry_skus")
      .select("sku_name, stock_status, stock_quantity")
      .eq("visit_entry_id", entry.id)

    if (skuError) {
      setFormMessage(`Could not load SKU details: ${skuError.message}`)
      return
    }

    const loadedSkuState = createInitialSkuState()
    for (const row of data || []) {
      if (!loadedSkuState[row.sku_name]) {
        continue
      }

      loadedSkuState[row.sku_name] = {
        status: row.stock_status || "With Stock",
        quantity: String(row.stock_quantity ?? ""),
      }
    }

    setSelectedSavedFormId(entry.id)
    setWeekLabel(entry.week_label || "Unassigned")
    setVisitDate(entry.visit_date || new Date().toISOString().slice(0, 10))
    setSelectedStoreCode(entry.store_code || "")
    setBranchName(entry.branch_name || "")
    setPogStatus(entry.pog_status || "")
    setSkuStock(loadedSkuState)
    setVisitPhotos([])
    setExistingVisitReferences(Array.isArray(entry.visit_reference_urls) ? entry.visit_reference_urls : [])
    setFormMessage("Saved form loaded. You can edit values and submit again.")
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (!visitDate) {
      setFormMessage("Please select a visit date.")
      return
    }

    if (!String(weekLabel || "").trim()) {
      setFormMessage("Please enter a week label (example: Week 1).")
      return
    }

    if (!selectedStoreCode) {
      setFormMessage("Please select a store code.")
      return
    }

    if (!branchName) {
      setFormMessage("Branch name is required. Please re-select the store code.")
      return
    }

    if (!pogStatus) {
      setFormMessage("Please choose a POG status.")
      return
    }

    const uploadedReferences = visitPhotos.map((file) => file.name)
    const visitReferenceUrls = [...existingVisitReferences, ...uploadedReferences]

    const skuRows = SKU_ITEMS.map((sku) => {
      const parsedQuantity = Number.parseInt(String(skuStock[sku].quantity || "0"), 10)
      return {
        sku_name: sku,
        stock_status: skuStock[sku].status,
        stock_quantity: Number.isNaN(parsedQuantity) || parsedQuantity < 0 ? 0 : parsedQuantity,
      }
    })

    setIsSubmitting(true)
    setFormMessage("Saving entry to Supabase...")

    let { data: visitEntry, error: visitError } = await supabase
      .from("visit_entries")
      .insert({
        week_label: String(weekLabel).trim(),
        visit_date: visitDate,
        store_code: selectedStoreCode,
        branch_name: branchName,
        pog_status: pogStatus,
        visit_reference_urls: visitReferenceUrls,
      })
      .select("id")
      .single()

    if (visitError?.code === "42703") {
      const fallbackInsert = await supabase
        .from("visit_entries")
        .insert({
          visit_date: visitDate,
          store_code: selectedStoreCode,
          branch_name: branchName,
          pog_status: pogStatus,
          visit_reference_urls: visitReferenceUrls,
        })
        .select("id")
        .single()

      visitEntry = fallbackInsert.data
      visitError = fallbackInsert.error
    }

    if (visitError) {
      setIsSubmitting(false)
      setFormMessage(`Could not save visit entry: ${visitError.message}`)
      return
    }

    const skuPayload = skuRows.map((row) => ({
      visit_entry_id: visitEntry.id,
      ...row,
    }))

    const { error: skuError } = await supabase.from("visit_entry_skus").insert(skuPayload)

    if (skuError) {
      setIsSubmitting(false)
      setFormMessage(`Visit saved but SKU rows failed: ${skuError.message}`)
      return
    }

    await fetchSavedForms()
    setIsSubmitting(false)
    resetForm()
    setFormMessage("Visit entry saved successfully.")
  }

  async function handleDeleteSavedForm(entry) {
    const confirmed = window.confirm(`Delete this saved form for ${entry.branch_name || "this branch"}?`)
    if (!confirmed) {
      return
    }

    setDeletingFormId(entry.id)
    setFormMessage("Deleting saved form from Supabase...")

    const { error } = await supabase.from("visit_entries").delete().eq("id", entry.id)

    if (error) {
      setDeletingFormId("")
      setFormMessage(`Could not delete saved form: ${error.message}`)
      return
    }

    if (selectedSavedFormId === entry.id) {
      resetForm()
    }

    await fetchSavedForms()
    setDeletingFormId("")
    setFormMessage("Saved form deleted successfully.")
  }

  async function handleExpandWeekGroup(week, entries) {
    setIsModalOpen(true)
    setExpandedWeekLabel(week)
    setExpandedWeekEntries([])
    setModalError("")
    setModalLoading(true)

    try {
      const results = await Promise.all(
        entries.map(async (entry) => {
          const { data, error } = await supabase
            .from("visit_entry_skus")
            .select("sku_name, stock_status, stock_quantity")
            .eq("visit_entry_id", entry.id)

          if (error) {
            throw new Error(`${entry.branch_name || "Unnamed branch"}: ${error.message}`)
          }

          const bySku = new Map((data || []).map((row) => [row.sku_name, row]))
          const orderedRows = SKU_ITEMS.map((sku) => {
            const row = bySku.get(sku)
            return {
              sku_name: sku,
              stock_status: row?.stock_status || "-",
              stock_quantity: row?.stock_quantity ?? "-",
            }
          })

          return {
            entry,
            rows: orderedRows,
          }
        }),
      )

      setExpandedWeekEntries(results)
    } catch (error) {
      setModalError(error?.message || "Could not load the expanded week group.")
    } finally {
      setModalLoading(false)
    }
  }

  function closeExpandedModal() {
    setIsModalOpen(false)
    setExpandedWeekLabel("")
    setExpandedWeekEntries([])
    setModalError("")
    setModalLoading(false)
  }

  function sanitizeFileName(value) {
    return String(value || "week-export")
      .trim()
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "week-export"
  }

  async function handleImportWeekToExcel() {
    if (!expandedWeekEntries.length) {
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

      const sheetName = sanitizeFileName(expandedWeekLabel || "Week Export").slice(0, 31) || "Week Export"
      const worksheet = workbook.addWorksheet(sheetName, {
        properties: { defaultRowHeight: 18 },
        views: [{ state: "frozen", ySplit: 1 }],
      })

      worksheet.columns = [
        { key: "date", width: 14 },
        { key: "store_code", width: 14 },
        { key: "branch_name", width: 24 },
        { key: "sku", width: 22 },
        { key: "stock_status", width: 18 },
        { key: "stock_quantity", width: 18 },
        { key: "pog_status", width: 14 },
        { key: "visit_reference", width: 28 },
      ]

      const headerRow = worksheet.addRow([
        "Date",
        "Store Code",
        "Branch Name",
        "SKU",
        "Stock Status",
        "Stock Quantity",
        "POG STATUS",
        "Visit Reference",
      ])
      headerRow.height = 20
      headerRow.font = { name: "Aptos", size: 10, bold: true, color: { argb: "F5F9FF" } }
      headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "0B2642" },
      }
      headerRow.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "90ADC8" } },
          left: { style: "thin", color: { argb: "90ADC8" } },
          bottom: { style: "thin", color: { argb: "90ADC8" } },
          right: { style: "thin", color: { argb: "90ADC8" } },
        }
      })

      for (const { entry, rows } of expandedWeekEntries) {
        const rowsToExport = Array.isArray(rows) ? rows : []
        const mergeHeight = rowsToExport.length

        for (let index = 0; index < rowsToExport.length; index += 1) {
          const skuRow = rowsToExport[index]
          const excelRow = worksheet.addRow([
            index === 0 ? entry.visit_date || "-" : "",
            index === 0 ? entry.store_code || "-" : "",
            index === 0 ? entry.branch_name || "-" : "",
            skuRow.sku_name || "-",
            skuRow.stock_status || "-",
            skuRow.stock_quantity ?? "-",
            index === 0 ? entry.pog_status || "-" : "",
            index === 0
              ? Array.isArray(entry.visit_reference_urls) && entry.visit_reference_urls.length
                ? entry.visit_reference_urls.join(", ")
                : "No reference"
              : "",
          ])

          excelRow.height = 18
          excelRow.font = { name: "Aptos", size: 10, color: { argb: "EAF3FC" } }
          excelRow.alignment = { vertical: "middle", horizontal: "left", wrapText: true }

          if (index === 0 && mergeHeight > 1) {
            const startRow = excelRow.number
            const endRow = excelRow.number + mergeHeight - 1

            worksheet.mergeCells(startRow, 1, endRow, 1)
            worksheet.mergeCells(startRow, 2, endRow, 2)
            worksheet.mergeCells(startRow, 3, endRow, 3)
            worksheet.mergeCells(startRow, 7, endRow, 7)
            worksheet.mergeCells(startRow, 8, endRow, 8)

            const mergedCells = [1, 2, 3, 7, 8]
            mergedCells.forEach((columnIndex) => {
              const cell = excelRow.getCell(columnIndex)
              cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true }
              cell.font = { name: "Aptos", size: 10, color: { argb: "EAF3FC" } }
            })
          }

          const fillColor = index % 2 === 0 ? "10223A" : "13263D"
          excelRow.eachCell((cell) => {
            cell.border = {
              top: { style: "thin", color: { argb: "90ADC8" } },
              left: { style: "thin", color: { argb: "90ADC8" } },
              bottom: { style: "thin", color: { argb: "90ADC8" } },
              right: { style: "thin", color: { argb: "90ADC8" } },
            }
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: fillColor },
            }
          })
        }
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

  const isBranchSynced = !branchLoading && !branchError
  const isSavedFormsSynced = !savedFormsLoading && !savedFormsError
  const isFullySynced = isBranchSynced && isSavedFormsSynced
  const groupedForms = savedForms.reduce((groups, entry) => {
    const key = String(entry.week_label || "Unassigned").trim() || "Unassigned"
    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(entry)
    return groups
  }, {})
  const groupedWeekEntries = Object.entries(groupedForms).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))

  return (
    <main className="form-page">
      <section className="form-layout">
        <aside className="records-surface">
          <div className="panel-heading">
            <div>
              <p className="form-kicker">History</p>
              <h2>See all saved forms</h2>
            </div>
            <button
              type="button"
              className="action-button secondary-action panel-action"
              onClick={fetchSavedForms}
              disabled={savedFormsLoading}
            >
              {savedFormsLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {savedFormsLoading ? (
            <p className="helper-text">Loading saved forms...</p>
          ) : savedFormsError ? (
            <div className="feedback-box error-feedback compact-feedback">
              <strong>Could not load saved forms.</strong>
              <span>{savedFormsError}</span>
            </div>
          ) : savedForms.length ? (
            <div className="saved-forms-list">
              {groupedWeekEntries.map(([week, entries]) => (
                <section key={week} className="week-group">
                  <div className="week-group-header">
                    <p className="week-group-title">{week}</p>
                    <button
                      type="button"
                      className="expand-week-button"
                      onClick={() => handleExpandWeekGroup(week, entries)}
                    >
                      Expand
                    </button>
                  </div>
                  {entries.map((entry) => (
                    <article
                      key={entry.id}
                      className={`saved-form-row ${selectedSavedFormId === entry.id ? "active-saved-form" : ""}`}
                    >
                      <button type="button" className="saved-form-main" onClick={() => loadSavedForm(entry)}>
                        <p>{entry.branch_name || "Unnamed branch"}</p>
                        <span>
                          {entry.store_code || "No code"} | {entry.pog_status || "No POG"}
                        </span>
                        <span>
                          Visit: {entry.visit_date || "No date"} | Saved: {entry.created_at ? new Date(entry.created_at).toLocaleString() : "Unknown"}
                        </span>
                      </button>
                      <div className="saved-form-actions">
                        <button
                          type="button"
                          className="delete-form-button"
                          onClick={() => handleDeleteSavedForm(entry)}
                          disabled={deletingFormId === entry.id}
                        >
                          {deletingFormId === entry.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
              ))}
            </div>
          ) : (
            <p className="helper-text">No saved forms yet. Submit the form to create your first record.</p>
          )}
        </aside>

        <article className="form-surface">
          <header className="form-header">
            <div>
              <p className="form-kicker">WellNActive</p>
              <h1>Branch Visit Stock Form</h1>
              <p>
                Record branch visit data with per-SKU stock status and quantity, then attach visit
                references before submission.
              </p>
            </div>

            <div className="header-tools">
              <span className="data-pill">
                {branchLoading ? "Syncing branch list" : branchError ? "Branch list unavailable" : "Branch list ready"}
              </span>
              <button type="button" className="action-button" onClick={fetchBranches}>
                Reload Branches
              </button>
            </div>
          </header>

          <form className="visit-form" onSubmit={handleSubmit}>
            <div className="field-grid">
              <label className="form-field" htmlFor="weekLabel">
                <span>Week Group</span>
                <input
                  id="weekLabel"
                  list="weekOptions"
                  value={weekLabel}
                  placeholder="Type or choose (example: Week 1)"
                  onChange={(event) => {
                    setWeekLabel(event.target.value)
                    setFormMessage("")
                  }}
                />
                <datalist id="weekOptions">
                  <option value="Week 1" />
                  <option value="Week 2" />
                  <option value="Week 3" />
                  <option value="Week 4" />
                  <option value="Week 5" />
                </datalist>
              </label>
            </div>

            <div className="field-grid two-col">
              <label className="form-field" htmlFor="visitDate">
                <span>Date Selector</span>
                <input
                  id="visitDate"
                  type="date"
                  value={visitDate}
                  onChange={(event) => {
                    setVisitDate(event.target.value)
                    setFormMessage("")
                  }}
                />
              </label>

              <label className="form-field" htmlFor="storeCode">
                <span>Store Code Selector</span>
                <select
                  id="storeCode"
                  value={selectedStoreCode}
                  onChange={handleStoreCodeChange}
                  disabled={branchLoading || Boolean(branchError)}
                >
                  <option value="">Select a store code</option>
                  {branches.map((branch) => (
                    <option key={branch.code} value={branch.code}>
                      {branch.code}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="field-grid two-col">
              <label className="form-field" htmlFor="branchName">
                <span>Branch Name</span>
                <input
                  id="branchName"
                  type="text"
                  value={branchName}
                  readOnly
                  placeholder="Auto-filled after selecting store code"
                />
              </label>

              <label className="form-field" htmlFor="pogStatus">
                <span>POG Status</span>
                <select
                  id="pogStatus"
                  value={pogStatus}
                  onChange={(event) => {
                    setPogStatus(event.target.value)
                    setFormMessage("")
                  }}
                >
                  <option value="">Select POG status</option>
                  <option value="POG">POG</option>
                  <option value="Non-POG">Non-POG</option>
                </select>
              </label>
            </div>

            <section className="sku-block">
              <div className="sku-heading">
                <p className="form-kicker">SKU Stock Status</p>
                <h2>Stock per SKU</h2>
              </div>

              <div className="sku-grid">
                {SKU_ITEMS.map((sku) => (
                  <article key={sku} className="sku-card">
                    <h3>{sku}</h3>

                    <label className="form-field" htmlFor={`status-${sku}`}>
                      <span>Stock Status</span>
                      <select
                        id={`status-${sku}`}
                        value={skuStock[sku].status}
                        onChange={(event) => handleSkuFieldChange(sku, "status", event.target.value)}
                      >
                        {STOCK_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="form-field" htmlFor={`quantity-${sku}`}>
                      <span>Stock Quantity</span>
                      <input
                        id={`quantity-${sku}`}
                        type="number"
                        min="0"
                        step="1"
                        placeholder="Enter quantity"
                        value={skuStock[sku].quantity}
                        disabled={skuStock[sku].status === "Out of Stock"}
                        onChange={(event) => handleSkuFieldChange(sku, "quantity", event.target.value)}
                      />
                    </label>
                  </article>
                ))}
              </div>
            </section>

            <section className="visit-reference-block">
              <label className="form-field" htmlFor="visitReference">
                <span>Visit Reference</span>
                <input
                  id="visitReference"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleVisitPhotoChange}
                />
              </label>

              {visitPhotos.length ? (
                <ul className="file-list">
                  {visitPhotos.map((file) => (
                    <li key={file.name}>{file.name}</li>
                  ))}
                </ul>
              ) : (
                <p className="helper-text">Upload one or more branch visit photos.</p>
              )}

              {existingVisitReferences.length ? (
                <div>
                  <p className="helper-text">Existing references from selected saved form:</p>
                  <ul className="file-list">
                    {existingVisitReferences.map((reference) => (
                      <li key={reference}>{reference}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            <div className="form-actions">
              <button type="submit" className="action-button primary-action" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Visit Entry"}
              </button>
              <button
                type="button"
                className="action-button secondary-action"
                onClick={resetForm}
                disabled={isSubmitting}
              >
                Clear Form
              </button>
            </div>
          </form>

          {formMessage ? <div className="feedback-box">{formMessage}</div> : null}

          {branchError ? (
            <div className="feedback-box error-feedback">
              <strong>Could not load branch list.</strong>
              <span>{branchError}</span>
            </div>
          ) : null}
        </article>

        <aside className="summary-surface">
          <p className="form-kicker">Live Summary</p>
          <h2>Database Sync Status</h2>

          <div className="summary-list">
            <div>
              <span>Overall Sync</span>
              <strong className={isFullySynced ? "sync-ok" : "sync-bad"}>
                {isFullySynced ? "100% Synced" : "Sync issue detected"}
              </strong>
            </div>
            <div>
              <span>Branch Masterlist</span>
              <strong className={isBranchSynced ? "sync-ok" : "sync-bad"}>
                {branchLoading ? "Syncing..." : branchError ? "Not synced" : "100% Synced"}
              </strong>
            </div>
            <div>
              <span>Saved Forms</span>
              <strong className={isSavedFormsSynced ? "sync-ok" : "sync-bad"}>
                {savedFormsLoading ? "Syncing..." : savedFormsError ? "Not synced" : "100% Synced"}
              </strong>
            </div>
            <div>
              <span>Branch Rows Loaded</span>
              <strong>{branches.length}</strong>
            </div>
            <div>
              <span>Saved Forms Loaded</span>
              <strong>{savedForms.length}</strong>
            </div>
            <div>
              <span>Current Week Group</span>
              <strong>{weekLabel || "Not set"}</strong>
            </div>
          </div>

          <p className="sync-time">
            Last branch sync: {lastUpdated ? lastUpdated.toLocaleString() : "Not synced yet"}
            <br />
            Last saved forms sync: {savedFormsLastUpdated ? savedFormsLastUpdated.toLocaleString() : "Not synced yet"}
          </p>
        </aside>
      </section>

      {isModalOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Saved form details">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <p className="form-kicker">Saved Form Details</p>
                <h3>{expandedWeekLabel || "Unassigned"}</h3>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="action-button export-button"
                  onClick={handleImportWeekToExcel}
                  disabled={modalLoading || isExporting || !expandedWeekEntries.length}
                >
                  {isExporting ? "Exporting..." : "Import to excel"}
                </button>
                <button type="button" className="action-button secondary-action modal-close" onClick={closeExpandedModal}>
                  Close
                </button>
              </div>
            </div>

            {modalLoading ? (
              <p className="helper-text">Loading week group expanded view...</p>
            ) : modalError ? (
              <div className="feedback-box error-feedback compact-feedback">
                <strong>Could not load expanded week group.</strong>
                <span>{modalError}</span>
              </div>
            ) : expandedWeekEntries.length ? (
              <div className="expanded-week-stack">
                {expandedWeekEntries.map(({ entry, rows }) => (
                  <div key={entry.id} className="expanded-entry-block">
                    <div className="expanded-entry-meta">
                      <strong>{entry.branch_name || "Unnamed branch"}</strong>
                      <span>
                        Date: {entry.visit_date || "-"} | Store Code: {entry.store_code || "-"} | POG: {entry.pog_status || "-"}
                      </span>
                    </div>

                    <div className="expanded-table-wrap">
                      <table className="expanded-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Store Code</th>
                            <th>Branch Name</th>
                            <th>SKU</th>
                            <th>Stock Status</th>
                            <th>Stock Quantity</th>
                            <th>POG Status</th>
                            <th>Visit Reference</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, index) => (
                            <tr key={`${entry.id}-${row.sku_name}`}>
                              {index === 0 ? (
                                <>
                                  <td rowSpan={rows.length}>{entry.visit_date || "-"}</td>
                                  <td rowSpan={rows.length}>{entry.store_code || "-"}</td>
                                  <td rowSpan={rows.length}>{entry.branch_name || "-"}</td>
                                </>
                              ) : null}

                              <td>{row.sku_name}</td>
                              <td>{row.stock_status}</td>
                              <td>{row.stock_quantity}</td>

                              {index === 0 ? (
                                <>
                                  <td rowSpan={rows.length}>{entry.pog_status || "-"}</td>
                                  <td rowSpan={rows.length}>
                                    {Array.isArray(entry.visit_reference_urls) && entry.visit_reference_urls.length
                                      ? entry.visit_reference_urls.join(", ")
                                      : "No reference"}
                                  </td>
                                </>
                              ) : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default App