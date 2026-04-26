import { useEffect, useRef, useState } from "react"
import { analyzeAnalyticsMessage, getMostVisitedBranches, getOutOfStockSKUs, getWeeklySummary } from "../../services/analyticsEngine"

const QUICK_ACTIONS = [
  {
    label: "Most visited branch",
    action: "most visited branch",
    runner: getMostVisitedBranches,
  },
  {
    label: "Out of stock SKUs",
    action: "out of stock skus",
    runner: getOutOfStockSKUs,
  },
  {
    label: "Weekly summary",
    action: "weekly summary comparison",
    runner: getWeeklySummary,
  },
]

function ChatBubble({ message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-2xl rounded-br-md border border-cyan-400/20 bg-cyan-400/15 px-3 py-2 text-sm text-cyan-50 shadow-sm shadow-cyan-950/10">
          {message.content}
        </div>
      </div>
    )
  }

  const response = message.response

  return (
    <div className="rounded-2xl border border-slate-200/10 bg-slate-950/35 p-4 shadow-sm shadow-black/15">
      {response ? (
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/80">{response.title}</p>
            <p className="text-sm leading-6 text-slate-200/85">{response.explanation}</p>
          </div>

          <div className="space-y-2.5">
            {response.results?.length ? (
              response.results.map((item) => (
                <div
                  key={`${item.rank}-${item.label}`}
                  className="rounded-2xl border border-slate-200/10 bg-white/[0.04] px-4 py-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-white">
                        {item.rank}. {item.label}
                      </p>
                      <span className="shrink-0 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-xs font-semibold text-emerald-100">
                        {item.value}
                      </span>
                    </div>
                    {item.detail ? <p className="text-xs leading-5 text-slate-300">{item.detail}</p> : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-300">No ranked results available.</p>
            )}
          </div>

          <div className="rounded-2xl border border-amber-300/15 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-50">
            <span className="font-semibold text-amber-100">Insight:</span> {response.insight}
          </div>
        </div>
      ) : (
        <p className="text-sm leading-6 text-slate-200/90">{message.content}</p>
      )}
    </div>
  )
}

export default function AnalyticsChat() {
  const [messages, setMessages] = useState([
    {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "Ask me about branch visits, stock gaps, POG compliance, or weekly trends.",
    },
  ])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(true)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, isLoading])

  async function sendQuery(rawValue) {
    const nextMessage = String(rawValue || "").trim()
    if (!nextMessage || isLoading) {
      return
    }

    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: nextMessage,
      },
    ])
    setInputValue("")
    setIsLoading(true)

    try {
      const response = await analyzeAnalyticsMessage(nextMessage)

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "",
          response,
        },
      ])
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: error?.message || "Could not analyze that question.",
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  async function runQuickAction(action) {
    if (isLoading) {
      return
    }

    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: action.label,
      },
    ])
    setIsLoading(true)

    try {
      const response = await action.runner()
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "",
          response,
        },
      ])
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: error?.message || "Could not analyze that quick action.",
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  function handleSubmit(event) {
    event.preventDefault()
    void sendQuery(inputValue)
  }

  return (
    <section className="analytics-chat-float" aria-label="Operations analytics chatbot">
      {isCollapsed ? (
        <button
          type="button"
          className="analytics-chat-launcher"
          onClick={() => setIsCollapsed(false)}
          aria-expanded={false}
          aria-label="Open analytics chatbot"
          title="Open analytics chatbot"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M4 5.5A2.5 2.5 0 016.5 3h11A2.5 2.5 0 0120 5.5v7A2.5 2.5 0 0117.5 15H11l-4.4 3.7A1 1 0 015 18v-3.3A2.5 2.5 0 014 12.5v-7zM6.5 5a.5.5 0 00-.5.5v7c0 .28.22.5.5.5H7v1.75L9.1 13H17.5a.5.5 0 00.5-.5v-7a.5.5 0 00-.5-.5h-11z"
              fill="currentColor"
            />
          </svg>
        </button>
      ) : (
        <div className="analytics-chat-panel">
          <div className="analytics-chat-header">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/80">Operations Analytics</p>
              <h3 className="mt-1 text-lg font-semibold text-white">Chat with your data</h3>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {isLoading ? (
                <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-100">
                  Analyzing...
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setIsCollapsed(true)}
                className="analytics-chat-collapse-button"
                aria-expanded={true}
                aria-label="Collapse analytics chatbot"
                title="Collapse analytics chatbot"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M5 11h14v2H5z" fill="currentColor" />
                </svg>
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => void runQuickAction(action)}
                disabled={isLoading}
                className="rounded-full border border-slate-200/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-cyan-300/40 hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {action.label}
              </button>
            ))}
          </div>

          <div className="analytics-chat-messages mt-4">
            <div className="space-y-3.5">
              {messages.map((message) => (
                <ChatBubble key={message.id} message={message} />
              ))}
              {isLoading ? (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-slate-200/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
                    Analyzing...
                  </div>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="analytics-chat-input-row mt-4 flex gap-2">
            <label className="sr-only" htmlFor="analyticsQuestion">
              Ask an analytics question
            </label>
            <input
              id="analyticsQuestion"
              type="text"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder="Ask about visits, OOS SKUs, POG compliance, or weekly trends"
              disabled={isLoading}
              className="min-w-0 flex-1 rounded-2xl border border-slate-200/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20 disabled:opacity-70"
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              className="rounded-2xl bg-gradient-to-r from-cyan-300 to-emerald-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </section>
  )
}
