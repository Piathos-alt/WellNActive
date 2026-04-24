import { useEffect, useMemo, useState } from "react"
import { supabase } from "./supabaseClient"
import "./App.css"

function App() {
  const [stores, setStores] = useState([])
  const [branches, setBranches] = useState([])
  const [selectedBranchCode, setSelectedBranchCode] = useState("")
  const [branchName, setBranchName] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [branchLoading, setBranchLoading] = useState(true)
  const [branchError, setBranchError] = useState("")
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    fetchStores()
    fetchBranches()
  }, [])

  useEffect(() => {
    if (!selectedBranchCode) {
      setBranchName("")
      return
    }

    const selectedBranch = branches.find((branch) => branch.code === selectedBranchCode)
    setBranchName(selectedBranch?.name || "")
  }, [branches, selectedBranchCode])

  async function fetchStores() {
    setLoading(true)
    setError("")

    const { data, error: fetchError } = await supabase
      .from("branch_masterlist")
      .select("code, branch_name")
      .order("code", { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
      setStores([])
    } else {
      setStores(data || [])
      setLastUpdated(new Date())
    }

    setLoading(false)
  }

  async function fetchBranches() {
    setBranchLoading(true)
    setBranchError("")

    const { data, error: fetchError } = await supabase
      .from("branch_masterlist")
      .select("code, branch_name")

    if (fetchError) {
      setBranchError(fetchError.message)
      setBranches([])
      setSelectedBranchCode("")
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
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" }))

    setBranches(mapped)
    setBranchLoading(false)
  }

  function handleBranchCodeChange(event) {
    const code = event.target.value
    setSelectedBranchCode(code)

    const selectedBranch = branches.find((branch) => branch.code === code)
    setBranchName(selectedBranch?.name || "")
  }

  const metrics = useMemo(() => {
    const totalBranches = stores.length
    const branchesWithCode = stores.filter((branch) => String(branch.code || "").trim()).length
    const uniqueBranchNames = new Set(
      stores.map((branch) => String(branch.branch_name || "").trim()).filter(Boolean),
    ).size

    return [
      { label: "Total branches", value: totalBranches, detail: "Rows from branch_masterlist" },
      { label: "With branch code", value: branchesWithCode, detail: "Rows with a valid code" },
      { label: "Unique names", value: uniqueBranchNames, detail: "Distinct branch_name values" },
    ]
  }, [stores])

  const recentBranches = stores.slice(0, 6)

  return (
    <main className="dashboard-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">WellNActive</p>
          <h1>Store Tracker Dashboard</h1>
          <p className="hero-copy">
            A simple live dashboard for checking store data at a glance. This version is built to
            deploy cleanly on Vercel and still show a usable layout if the data source is empty.
          </p>
        </div>

        <div className="hero-panel">
          <span className="status-pill">{loading ? "Syncing live data" : error ? "Live data offline" : "Live data connected"}</span>
          <div>
            <p className="panel-label">Last refresh</p>
            <strong>{lastUpdated ? lastUpdated.toLocaleString() : "Waiting for first sync"}</strong>
          </div>
        </div>
      </section>

      <section className="metrics-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className="metric-card">
            <p>{metric.label}</p>
            <strong>{metric.value}</strong>
            <span>{metric.detail}</span>
          </article>
        ))}
      </section>

      <section className="content-grid">
        <article className="surface">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Branch masterlist</p>
              <h2>Tracked branches</h2>
            </div>
            <button type="button" className="refresh-button" onClick={fetchStores}>
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="state-box">Loading branch data...</div>
          ) : error ? (
            <div className="state-box error-state">
              <strong>Could not load live data.</strong>
              <span>{error}</span>
            </div>
          ) : recentBranches.length ? (
            <div className="store-list">
              {recentBranches.map((branch) => (
                <div key={branch.code ?? branch.branch_name} className="store-row">
                  <div>
                    <strong>{branch.branch_name || "Unnamed branch"}</strong>
                    <span>{branch.code || "No branch code"}</span>
                  </div>
                  <div className="store-meta">
                    <span>Source: branch_masterlist</span>
                    <span>{branch.code ? "Code available" : "Missing code"}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="state-box">
              No branch records yet. Add rows to the <code>branch_masterlist</code> table and they will appear here.
              <p className="debug-hint">
                Debug tip: If you uploaded rows already, this usually means RLS is blocking anon select
                access or this app is pointed to a different Supabase project URL/key.
              </p>
            </div>
          )}
        </article>

        <article className="surface accent-surface">
          <div className="section-heading compact-heading">
            <div>
              <p className="section-kicker">Branch picker test</p>
              <h2>Branch masterlist form</h2>
            </div>
            <button type="button" className="refresh-button" onClick={fetchBranches}>
              Reload branches
            </button>
          </div>

          <form className="branch-form" onSubmit={(event) => event.preventDefault()}>
            <label htmlFor="branchCode">Branch code</label>
            <select
              id="branchCode"
              value={selectedBranchCode}
              onChange={handleBranchCodeChange}
              disabled={branchLoading || Boolean(branchError)}
            >
              <option value="">Select a branch code</option>
              {branches.map((branch) => (
                <option key={branch.code} value={branch.code}>
                  {branch.code}
                </option>
              ))}
            </select>

            <label htmlFor="branchName">Branch name</label>
            <input
              id="branchName"
              type="text"
              value={branchName}
              readOnly
              placeholder="Branch name will auto-fill"
            />
          </form>

          {branchLoading ? (
            <div className="state-box branch-state">Loading branch list...</div>
          ) : branchError ? (
            <div className="state-box error-state branch-state">
              <strong>Could not load branch_masterlist.</strong>
              <span>{branchError}</span>
            </div>
          ) : (
            <div>
              <p className="branch-helper">
                Loaded {branches.length} branch {branches.length === 1 ? "record" : "records"} from Supabase.
              </p>
              {branches.length === 0 ? (
                <p className="debug-hint branch-helper">
                  Debug tip: Query returned 0 rows. Check Supabase RLS policy for table
                  <code> branch_masterlist </code>
                  and verify the app is using the same project where you uploaded the data.
                </p>
              ) : null}
            </div>
          )}
        </article>
      </section>
    </main>
  )
}

export default App