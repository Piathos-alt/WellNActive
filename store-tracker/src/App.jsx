import { useEffect, useState } from "react"
import { supabase } from "./supabaseClient"
import { exportWeekToExcel } from "./excelExport"
import "./App.css"

const SKU_ITEMS = ["Neck & Shoulder", "Menstrual", "Back", "Knee & Joint"]
const STOCK_OPTIONS = ["With Stock", "Low Stock", "Out of Stock"]
const DEFAULT_WEEK_OPTIONS = ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5"]
const WEEK_HISTORY_STORAGE_KEY = "wellnactive-week-history"

function createInitialSkuState() {
  return SKU_ITEMS.reduce((accumulator, sku) => {
    accumulator[sku] = {
      status: "With Stock",
      quantity: "",
    }
    return accumulator
  }, {})
}

function normalizeWeekOptions(values) {
  return Array.from(
    new Set(
      (values || [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
}

function readWeekHistoryFromStorage() {
  if (typeof window === "undefined") {
    return []
  }

  try {
    const raw = window.localStorage.getItem(WEEK_HISTORY_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return normalizeWeekOptions(parsed)
  } catch {
    return []
  }
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
  const [weekOptions, setWeekOptions] = useState(() => normalizeWeekOptions([...DEFAULT_WEEK_OPTIONS, ...readWeekHistoryFromStorage()]))
  const [isAddingWeek, setIsAddingWeek] = useState(false)
  const [newWeekInput, setNewWeekInput] = useState("")
  const [isStoreModalOpen, setIsStoreModalOpen] = useState(false)
  const [newStoreCode, setNewStoreCode] = useState("")
  const [newBranchName, setNewBranchName] = useState("")
  const [storeModalError, setStoreModalError] = useState("")
  const [isSavingStore, setIsSavingStore] = useState(false)
  const [storeCodeLookupStatus, setStoreCodeLookupStatus] = useState("idle")

  function saveWeekOptions(nextOptions) {
    const normalized = normalizeWeekOptions(nextOptions)
    setWeekOptions(normalized)

    if (typeof window !== "undefined") {
      window.localStorage.setItem(WEEK_HISTORY_STORAGE_KEY, JSON.stringify(normalized))
    }
  }

  function registerWeekLabel(value) {
    const trimmed = String(value || "").trim()
    if (!trimmed) {
      return
    }

    saveWeekOptions([...weekOptions, trimmed])
  }

  function handleWeekSelectChange(event) {
    const value = event.target.value

    if (value === "__new__") {
      setIsAddingWeek(true)
      setNewWeekInput("")
      setWeekLabel("")
      return
    }

    setIsAddingWeek(false)
    setNewWeekInput("")
    setWeekLabel(value)
    setFormMessage("")
  }

  function handleNewWeekCommit() {
    const trimmed = String(newWeekInput || "").trim()
    if (!trimmed) {
      return
    }

    registerWeekLabel(trimmed)
    setWeekLabel(trimmed)
    setIsAddingWeek(false)
    setNewWeekInput("")
    setFormMessage("")
  }

  useEffect(() => {
    fetchBranches()
    fetchSavedForms()
  }, [])

  useEffect(() => {
    const weeksFromSavedForms = savedForms
      .map((entry) => String(entry.week_label || "").trim())
      .filter(Boolean)

    const merged = normalizeWeekOptions([...DEFAULT_WEEK_OPTIONS, ...readWeekHistoryFromStorage(), ...weeksFromSavedForms])
    if (merged.join("||") !== weekOptions.join("||")) {
      saveWeekOptions(merged)
    }
  }, [savedForms])

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

  useEffect(() => {
    if (!isStoreModalOpen) {
      return
    }

    const trimmedCode = String(newStoreCode || "").trim().toUpperCase()
    if (!trimmedCode) {
      setStoreCodeLookupStatus("idle")
      return
    }

    setStoreCodeLookupStatus("checking")
    let isCancelled = false

    const timeoutId = window.setTimeout(async () => {
      const lookupResult = await supabase
        .from("branch_masterlist")
        .select("code")
        .eq("code", trimmedCode)
        .limit(1)

      if (isCancelled) {
        return
      }

      if (lookupResult.error) {
        setStoreCodeLookupStatus("error")
        return
      }

      if ((lookupResult.data || []).length > 0) {
        setStoreCodeLookupStatus("existing")
      } else {
        setStoreCodeLookupStatus("new")
      }
    }, 300)

    return () => {
      isCancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [isStoreModalOpen, newStoreCode])

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

  function openStoreModal() {
    setNewStoreCode("")
    setNewBranchName("")
    setStoreModalError("")
    setStoreCodeLookupStatus("idle")
    setIsStoreModalOpen(true)
  }

  function closeStoreModal() {
    if (isSavingStore) {
      return
    }

    setIsStoreModalOpen(false)
    setNewStoreCode("")
    setNewBranchName("")
    setStoreModalError("")
    setStoreCodeLookupStatus("idle")
  }

  async function handleSaveNewStore(event) {
    event.preventDefault()

    const trimmedCode = String(newStoreCode || "").trim().toUpperCase()
    const trimmedName = String(newBranchName || "").trim()

    if (!trimmedCode) {
      setStoreModalError("Store code is required.")
      return
    }

    if (!trimmedName) {
      setStoreModalError("Branch name is required.")
      return
    }

    setIsSavingStore(true)
    setStoreModalError("")

    const existingStoreResult = await supabase
      .from("branch_masterlist")
      .select("code, branch_name")
      .eq("code", trimmedCode)
      .limit(1)

    if (existingStoreResult.error) {
      setIsSavingStore(false)
      setStoreModalError(`Could not validate existing store code: ${existingStoreResult.error.message}`)
      return
    }

    const existingStore = (existingStoreResult.data || [])[0]
    const existingBranchName = String(existingStore?.branch_name || "").trim()

    if (existingStore && existingBranchName.toLowerCase() === trimmedName.toLowerCase()) {
      setIsSavingStore(false)
      setStoreModalError("This store code and branch name already exist.")
      setFormMessage(`No changes made. ${trimmedCode} already maps to ${trimmedName}.`)
      return
    }

    if (existingStore && existingBranchName && existingBranchName.toLowerCase() !== trimmedName.toLowerCase()) {
      const shouldUpdate = window.confirm(
        `${trimmedCode} already maps to ${existingBranchName}. Update it to ${trimmedName}?`,
      )

      if (!shouldUpdate) {
        setIsSavingStore(false)
        return
      }

      const updateResult = await supabase
        .from("branch_masterlist")
        .update({ branch_name: trimmedName })
        .eq("code", trimmedCode)

      if (updateResult.error) {
        setIsSavingStore(false)
        setStoreModalError(`Could not update existing store code: ${updateResult.error.message}`)
        return
      }

      await fetchBranches()
      setSelectedStoreCode(trimmedCode)
      setBranchName(trimmedName)
      setFormMessage(`Store code ${trimmedCode} updated successfully.`)
      setIsSavingStore(false)
      closeStoreModal()
      return
    }

    const shouldSaveNewCode = window.confirm(`Save new store mapping ${trimmedCode} - ${trimmedName}?`)
    if (!shouldSaveNewCode) {
      setIsSavingStore(false)
      return
    }

    const insertResult = await supabase
      .from("branch_masterlist")
      .insert({
        code: trimmedCode,
        branch_name: trimmedName,
      })

    if (insertResult.error?.code === "23505") {
      const updateResult = await supabase
        .from("branch_masterlist")
        .update({ branch_name: trimmedName })
        .eq("code", trimmedCode)

      if (updateResult.error) {
        setIsSavingStore(false)
        setStoreModalError(`Could not update existing store code: ${updateResult.error.message}`)
        return
      }
    } else if (insertResult.error) {
      setIsSavingStore(false)
      setStoreModalError(`Could not save store code: ${insertResult.error.message}`)
      return
    }

    await fetchBranches()
    setSelectedStoreCode(trimmedCode)
    setBranchName(trimmedName)
    setFormMessage(`Store code ${trimmedCode} saved successfully.`)
    setIsSavingStore(false)
    closeStoreModal()
  }

  const isExistingStoreCodeDetected = storeCodeLookupStatus === "existing"
  const storeCodeInputClassName = `store-code-input ${
    storeCodeLookupStatus === "new" ? "store-code-new" : storeCodeLookupStatus === "existing" ? "store-code-existing" : ""
  }`

  function handleFormKeyDown(event) {
    if (event.key !== "Enter") {
      return
    }

    const target = event.target
    if (!(target instanceof HTMLElement)) {
      return
    }

    if (target.tagName === "TEXTAREA") {
      return
    }

    if (target.id === "visitReference") {
      return
    }

    event.preventDefault()

    const form = event.currentTarget
    if (!(form instanceof HTMLFormElement)) {
      return
    }

    const focusableElements = Array.from(
      form.querySelectorAll('input, select, textarea, button:not([type="submit"])'),
    ).filter((element) => {
      if (!(element instanceof HTMLElement)) {
        return false
      }

      if (element.tabIndex < 0) {
        return false
      }

      if (element.hasAttribute("disabled")) {
        return false
      }

      if (element.getAttribute("type") === "hidden") {
        return false
      }

      return true
    })

    const currentIndex = focusableElements.indexOf(target)
    if (currentIndex < 0) {
      return
    }

    const nextField = focusableElements[currentIndex + 1]
    if (nextField instanceof HTMLElement) {
      nextField.focus()
    }
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
    // Revoke previously created preview URLs before replacing the file list.
    visitPhotos.forEach((item) => {
      if (item?.preview) {
        URL.revokeObjectURL(item.preview)
      }
    })

    const selectedFiles = Array.from(event.target.files || [])
    const filesWithPreview = selectedFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }))
    setVisitPhotos(filesWithPreview)
    setFormMessage("")
  }

  function removeVisitPhoto(index) {
    setVisitPhotos((current) => {
      const removedItem = current[index]
      if (removedItem?.preview) {
        URL.revokeObjectURL(removedItem.preview)
      }

      return current.filter((_, i) => i !== index)
    })
  }

  useEffect(() => {
    return () => {
      visitPhotos.forEach((item) => {
        if (item?.preview) {
          URL.revokeObjectURL(item.preview)
        }
      })
    }
  }, [visitPhotos])

  function resetForm() {
    setWeekLabel("Week 1")
    setIsAddingWeek(false)
    setNewWeekInput("")
    setVisitDate(new Date().toISOString().slice(0, 10))
    setSelectedSavedFormId("")
    setSelectedStoreCode("")
    setBranchName("")
    setPogStatus("")
    setSkuStock(createInitialSkuState())
    visitPhotos.forEach((item) => {
      if (item?.preview) {
        URL.revokeObjectURL(item.preview)
      }
    })
    setVisitPhotos([])
    setExistingVisitReferences([])
    setFormMessage("")
  }

  async function uploadVisitPhotos(uploadedFiles) {
    const uploadedUrls = []

    for (const item of uploadedFiles) {
      const file = item.file
      const timestamp = Date.now()
      const randomStr = Math.random().toString(36).substring(2, 8)
      const storagePath = `visit-photos/${timestamp}-${randomStr}-${file.name}`

      const { error: uploadError } = await supabase.storage
          .from("visit-reference")
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
        })

      if (uploadError) {
        throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`)
      }

      const { data: urlData } = supabase.storage
          .from("visit-reference")
        .getPublicUrl(storagePath)

      if (urlData?.publicUrl) {
        uploadedUrls.push(urlData.publicUrl)
      } else {
        throw new Error(`Could not get URL for ${file.name}`)
      }
    }

    return uploadedUrls
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
    visitPhotos.forEach((item) => {
      if (item?.preview) {
        URL.revokeObjectURL(item.preview)
      }
    })
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

    registerWeekLabel(weekLabel)

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

    const skuRows = SKU_ITEMS.map((sku) => {
      const parsedQuantity = Number.parseInt(String(skuStock[sku].quantity || "0"), 10)
      return {
        sku_name: sku,
        stock_status: skuStock[sku].status,
        stock_quantity: Number.isNaN(parsedQuantity) || parsedQuantity < 0 ? 0 : parsedQuantity,
      }
    })

    setIsSubmitting(true)

    let uploadedUrls = []
    if (visitPhotos.length > 0) {
      try {
        setFormMessage("Uploading photos...")
        uploadedUrls = await uploadVisitPhotos(visitPhotos)
      } catch (error) {
        setIsSubmitting(false)
        setFormMessage(`Photo upload failed: ${error.message}`)
        return
      }
    }

    const visitReferenceUrls = [...existingVisitReferences, ...uploadedUrls]

    let visitEntry
    let visitError

    if (selectedSavedFormId) {
      // UPDATE existing form
      setFormMessage("Updating entry in Supabase...")
      const { data, error: updateError } = await supabase
        .from("visit_entries")
        .update({
          week_label: String(weekLabel).trim(),
          visit_date: visitDate,
          store_code: selectedStoreCode,
          branch_name: branchName,
          pog_status: pogStatus,
          visit_reference_urls: visitReferenceUrls,
        })
        .eq("id", selectedSavedFormId)
        .select("id")
        .single()

      visitEntry = data
      visitError = updateError
    } else {
      // INSERT new form
      setFormMessage("Saving entry to Supabase...")
      let { data: newEntry, error: insertError } = await supabase
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

      if (insertError?.code === "42703") {
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

        newEntry = fallbackInsert.data
        insertError = fallbackInsert.error
      }

      visitEntry = newEntry
      visitError = insertError
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

    const { error: skuError } = await supabase
      .from("visit_entry_skus")
      .upsert(skuPayload, { onConflict: "visit_entry_id,sku_name" })

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

  async function handleImportWeekToExcel() {
    await exportWeekToExcel(expandedWeekLabel, expandedWeekEntries, setModalError, setIsExporting)
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

          <form className="visit-form" onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
            <div className="field-grid">
              <label className="form-field" htmlFor="weekLabel">
                <span>Week Group</span>
                <select
                  id="weekLabel"
                  value={isAddingWeek ? "__new__" : weekLabel}
                  onChange={handleWeekSelectChange}
                >
                  <option value="">Select week group</option>
                  {weekOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                  <option value="__new__">+ Add new week...</option>
                </select>

                {isAddingWeek ? (
                  <input
                    id="newWeekInput"
                    type="text"
                    value={newWeekInput}
                    placeholder="Type new week (example: Week Test)"
                    onChange={(event) => setNewWeekInput(event.target.value)}
                    onBlur={handleNewWeekCommit}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        handleNewWeekCommit()
                      }
                    }}
                  />
                ) : null}
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
                <div className="store-code-row">
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
                  <button
                    type="button"
                    className="add-store-button"
                    title="Add another store code?"
                    aria-label="Add another store code"
                    onClick={openStoreModal}
                  >
                    +
                  </button>
                </div>
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
                <div>
                  <p className="helper-text">Newly added photos:</p>
                  <div className="photo-preview-grid">
                    {visitPhotos.map((item, index) => (
                      <div key={index} className="photo-preview-item">
                        <img src={item.preview} alt={`Preview ${index + 1}`} className="photo-preview-img" />
                        <p className="photo-filename">{item.file.name}</p>
                        <button
                          type="button"
                          className="remove-photo-btn"
                          onClick={() => removeVisitPhoto(index)}
                          title="Remove this photo"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
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
                  {isExporting ? "Exporting..." : "Export to Excel"}
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
                                    {Array.isArray(entry.visit_reference_urls) && entry.visit_reference_urls.length ? (
                                      <div className="visit-reference-cell">
                                        <div className="reference-images">
                                          {entry.visit_reference_urls.map((url) => (
                                            <a
                                              key={url}
                                              href={url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="reference-image-link"
                                            >
                                              <img
                                                src={url}
                                                alt="Visit reference"
                                                className="reference-image-thumbnail"
                                              />
                                            </a>
                                          ))}
                                        </div>
                                      </div>
                                    ) : (
                                      "No reference"
                                    )}
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

      {isStoreModalOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Add another store code">
          <div className="modal-card add-store-modal-card">
            <div className="modal-header">
              <div>
                <p className="form-kicker">Store Masterlist</p>
                <h3>Add another store code</h3>
              </div>
            </div>

            <form className="visit-form" onSubmit={handleSaveNewStore}>
              <div className="field-grid two-col">
                <label className="form-field" htmlFor="newStoreCode">
                  <span>Store Code</span>
                  <div className="store-code-field-stack">
                    <input
                      id="newStoreCode"
                      type="text"
                      value={newStoreCode}
                      className={storeCodeInputClassName}
                      placeholder="Example: 1234"
                      onChange={(event) => {
                        setNewStoreCode(event.target.value.toUpperCase())
                        setStoreModalError("")
                      }}
                    />
                    <div className="store-code-hint-slot">
                      {storeCodeLookupStatus === "new" ? (
                        <p className="store-code-hint store-code-hint-new">New Code</p>
                      ) : null}
                      {storeCodeLookupStatus === "existing" ? (
                        <p className="store-code-hint store-code-hint-existing">Saved Store Code Detected</p>
                      ) : null}
                    </div>
                  </div>
                </label>

                <label className="form-field" htmlFor="newBranchName">
                  <span>Branch Name</span>
                  <input
                    id="newBranchName"
                    type="text"
                    value={newBranchName}
                    placeholder="Example: Makati Glorietta"
                    onChange={(event) => {
                      setNewBranchName(event.target.value)
                      setStoreModalError("")
                    }}
                  />
                </label>
              </div>

              {storeModalError ? (
                <div className="feedback-box error-feedback compact-feedback">
                  <strong>Could not save new store.</strong>
                  <span>{storeModalError}</span>
                </div>
              ) : null}

              <div className="form-actions">
                <button type="submit" className="action-button primary-action" disabled={isSavingStore}>
                  {isSavingStore ? "Saving..." : isExistingStoreCodeDetected ? "Update Store Code" : "Save Store Code"}
                </button>
                <button
                  type="button"
                  className="action-button secondary-action"
                  onClick={closeStoreModal}
                  disabled={isSavingStore}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default App