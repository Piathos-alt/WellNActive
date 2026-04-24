import { useEffect, useMemo, useState } from "react"
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
  const [formMessage, setFormMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

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

    const { data, error: fetchError } = await supabase
      .from("visit_entries")
      .select("id, visit_date, store_code, branch_name, pog_status, visit_reference_urls, created_at")
      .order("created_at", { ascending: false })

    if (fetchError) {
      setSavedFormsError(fetchError.message)
      setSavedForms([])
      setSavedFormsLoading(false)
      return
    }

    setSavedForms(data || [])
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

    const { data: visitEntry, error: visitError } = await supabase
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

  const stockSummary = useMemo(() => {
    return SKU_ITEMS.reduce(
      (summary, sku) => {
        const currentStatus = skuStock[sku].status
        summary[currentStatus] += 1
        return summary
      },
      {
        "With Stock": 0,
        "Low Stock": 0,
        "Out of Stock": 0,
      },
    )
  }, [skuStock])

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
              {savedForms.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`saved-form-row ${selectedSavedFormId === entry.id ? "active-saved-form" : ""}`}
                  onClick={() => loadSavedForm(entry)}
                >
                  <p>{entry.branch_name || "Unnamed branch"}</p>
                  <span>
                    {entry.store_code || "No code"} | {entry.pog_status || "No POG"}
                  </span>
                  <span>
                    Visit: {entry.visit_date || "No date"} | Saved: {entry.created_at ? new Date(entry.created_at).toLocaleString() : "Unknown"}
                  </span>
                </button>
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
          <h2>Visit Snapshot</h2>

          <div className="summary-list">
            <div>
              <span>Date</span>
              <strong>{visitDate || "Not selected"}</strong>
            </div>
            <div>
              <span>Store Code</span>
              <strong>{selectedStoreCode || "Not selected"}</strong>
            </div>
            <div>
              <span>Branch Name</span>
              <strong>{branchName || "Not selected"}</strong>
            </div>
            <div>
              <span>POG Status</span>
              <strong>{pogStatus || "Not selected"}</strong>
            </div>
            <div>
              <span>Visit References</span>
              <strong>{visitPhotos.length}</strong>
            </div>
          </div>

          <div className="summary-list stock-summary">
            <div>
              <span>With Stock</span>
              <strong>{stockSummary["With Stock"]}</strong>
            </div>
            <div>
              <span>Low Stock</span>
              <strong>{stockSummary["Low Stock"]}</strong>
            </div>
            <div>
              <span>Out of Stock</span>
              <strong>{stockSummary["Out of Stock"]}</strong>
            </div>
          </div>

          <p className="sync-time">Last branch sync: {lastUpdated ? lastUpdated.toLocaleString() : "Not synced yet"}</p>
        </aside>
      </section>
    </main>
  )
}

export default App