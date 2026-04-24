import { useEffect, useState } from "react"
import { supabase } from "./supabaseClient"

function App() {
  const [stores, setStores] = useState([])

  useEffect(() => {
    fetchStores()
  }, [])

  async function fetchStores() {
    const { data } = await supabase.from("stores").select("*")
    setStores(data)
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Store Dashboard</h1>

      {stores.map(store => (
        <div key={store.id}>
          {store.store_code} - {store.branch_name}
        </div>
      ))}
    </div>
  )
}

export default App