interface AiStatusPanelsProps {
  hasWon: boolean
  statusMessage: string
  ollamaError: string
  aiMemoryLimit: number
  aiMemorySummary: string
}

export function AiStatusPanels({
  hasWon,
  statusMessage,
  ollamaError,
  aiMemoryLimit,
  aiMemorySummary,
}: AiStatusPanelsProps) {
  return (
    <div className="ai-panels" role="status" aria-live="polite">
      <section className={`info-panel thinking-panel ${hasWon ? '' : 'is-muted'}`}>
        <span className="info-panel-label">AI thinking</span>
        <strong>{statusMessage}</strong>
        {ollamaError ? (
          <span className="info-panel-detail">{ollamaError}</span>
        ) : null}
      </section>

      <section className="info-panel memory-panel">
        <span className="info-panel-label">AI memory</span>
        <strong>{aiMemoryLimit} tiles</strong>
        <span className="info-panel-detail">{aiMemorySummary}</span>
      </section>
    </div>
  )
}
