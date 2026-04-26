import { useState } from "react"
import { supabase } from "./supabaseClient"
import "./App.css"

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      const { data, error: fetchError } = await supabase
        .from("users")
        .select("*")
        .eq("username", username)
        .eq("password", password)
        .single()

      if (fetchError || !data) {
        setError("Invalid username or password")
        setIsLoading(false)
        return
      }

      // Store user info in sessionStorage
      sessionStorage.setItem("wellnactive_user", JSON.stringify({
        id: data.id,
        username: data.username,
        role: data.role
      }))

      onLogin({ id: data.id, username: data.username, role: data.role })
    } catch (err) {
      setError("An error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-aura login-aura-one" aria-hidden="true" />
      <div className="login-aura login-aura-two" aria-hidden="true" />

      <div className="login-shell">
        <section className="login-brand-panel" aria-label="Product overview">
          <p className="login-kicker">WellNActiv Platform</p>
          <h1 className="login-title">OOS TRACKER</h1>
          <p className="login-subtitle">
            Keep every branch visit organized with a fast, reliable workflow for entries, validation, and reporting.
          </p>

          <ul className="login-points">
            <li>Real-time visit logging across stores</li>
            <li>SKU and POG status tracking in one view</li>
            <li>Export-ready records for daily reporting</li>
          </ul>
        </section>

        <section className="login-form-panel" aria-label="Sign in form">
          <h2 className="login-form-title">Sign In</h2>
          <p className="login-form-note">Use the authenticated account to proceed.</p>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                required
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                className="form-input"
              />
            </div>

            {error && <div className="error-message">{error}</div>}

            <button type="submit" className="login-button" disabled={isLoading}>
              {isLoading ? "Logging in..." : "Login"}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}