import { useEffect, useMemo, useState } from "react"
import { supabase } from "./supabaseClient"
import "./App.css"

function App() {
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    fetchStores()
  }, [])

  async function fetchStores() {
    setLoading(true)
    setError("")

    const { data, error: fetchError } = await supabase.from("stores").select("*").order("id", { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
      setStores([])
    } else {
      setStores(data || [])
      setLastUpdated(new Date())
    }

    setLoading(false)
  }

  const metrics = useMemo(() => {
    const totalStores = stores.length
    const activeStores = stores.filter((store) => {
      const status = String(store.status || store.state || "").toLowerCase()
      return ["active", "open", "live"].includes(status)
    }).length
    const uniqueBranches = new Set(
      stores.map((store) => String(store.branch_name || store.branch || "").trim()).filter(Boolean),
    ).size

    return [
      { label: "Total stores", value: totalStores, detail: "Pulled from Supabase" },
      { label: "Active stores", value: activeStores, detail: "Based on status fields" },
      { label: "Branches tracked", value: uniqueBranches, detail: "Unique branch names" },
    ]
  }, [stores])

  const recentStores = stores.slice(0, 6)

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
              <p className="section-kicker">Recent stores</p>
              <h2>Tracked locations</h2>
            </div>
            <button type="button" className="refresh-button" onClick={fetchStores}>
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="state-box">Loading store data...</div>
          ) : error ? (
            <div className="state-box error-state">
              <strong>Could not load live data.</strong>
              <span>{error}</span>
            </div>
          ) : recentStores.length ? (
            <div className="store-list">
              {recentStores.map((store) => (
                <div key={store.id ?? `${store.store_code}-${store.branch_name}`} className="store-row">
                  <div>
                    <strong>{store.branch_name || "Unnamed branch"}</strong>
                    <span>{store.store_code || store.code || "No store code"}</span>
                  </div>
                  <div className="store-meta">
                    <span>{store.status || store.state || "Unknown status"}</span>
                    <span>{store.region || store.city || "No region"}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="state-box">
              No store records yet. Add rows to the <code>stores</code> table and they will appear here.
            </div>
          )}
        </article>

        <article className="surface accent-surface">
          <p className="section-kicker">Overview</p>
          <h2>Dashboard snapshot</h2>
          <ul className="bullet-list">
            <li>Reads directly from Supabase when deployed.</li>
            <li>Shows a clear empty state instead of a blank screen.</li>
            <li>Uses a responsive layout that works on desktop and mobile.</li>
          </ul>
        </article>
      </section>
    </main>
  )
}

export default App