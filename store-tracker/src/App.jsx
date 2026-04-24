import { useEffect, useState } from "react"
import { supabase } from "./supabaseClient"
import "./App.css"

function App() {
  const [stores, setStores] = useState([])

  useEffect(() => {
    fetchStores()
  }, [])

  async function fetchStores() {
    const { data } = await supabase.from("stores").select("*")
    setStores(data || [])
  }

  return (
    <div className="container">
      <h1 className="title">Store Dashboard</h1>

      {stores.map((store) => (
        <div key={store.id} className="card">
          {store.store_code} - {store.branch_name}
        </div>
      ))}
    </div>
  )
}

export default App