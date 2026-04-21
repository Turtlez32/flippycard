import { AI_DIFFICULTIES } from '../lib/gameConfig'

export function GameControls({
  aiDifficulty,
  ollamaModels,
  selectedModel,
  ollamaState,
  onDifficultyChange,
  onModelChange,
  onRefreshModels,
  onResetGame,
}) {
  return (
    <div className="controls-panel">
      <label className="model-picker">
        <span>AI difficulty</span>
        <select
          value={aiDifficulty}
          onChange={(event) => onDifficultyChange(event.target.value)}
        >
          {Object.entries(AI_DIFFICULTIES).map(([key, difficulty]) => (
            <option key={key} value={key}>
              {difficulty.label} ({difficulty.memoryLimit} tiles)
            </option>
          ))}
        </select>
      </label>

      <label className="model-picker">
        <span>AI model</span>
        <select
          value={selectedModel}
          onChange={(event) => onModelChange(event.target.value)}
          disabled={ollamaState.loading || ollamaModels.length === 0}
        >
          {ollamaModels.length === 0 ? (
            <option value="">No models available</option>
          ) : (
            ollamaModels.map((model) => (
              <option key={model.name} value={model.name}>
                {model.label}
              </option>
            ))
          )}
        </select>
      </label>

      <div className="connection-panel">
        <span
          className={`connection-pill ${
            ollamaState.connected ? 'is-online' : 'is-offline'
          }`}
        >
          {ollamaState.loading
            ? 'Connecting'
            : ollamaState.connected
              ? 'Ollama ready'
              : 'Ollama offline'}
        </span>
      </div>

      <button
        type="button"
        className="reset-button"
        onClick={onRefreshModels}
        disabled={ollamaState.loading}
      >
        Refresh models
      </button>

      <button type="button" className="reset-button" onClick={onResetGame}>
        Shuffle again
      </button>
    </div>
  )
}
