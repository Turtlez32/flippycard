import './App.css'
import { AiStatusPanels } from './components/AiStatusPanels'
import { GameControls } from './components/GameControls'
import { GameHeader } from './components/GameHeader'
import { GameStats } from './components/GameStats'
import { MemoryBoard } from './components/MemoryBoard'
import { useMemoryGame } from './hooks/useMemoryGame'

function App() {
  const {
    deck,
    selectedIds,
    scores,
    moves,
    activePlayer,
    hasWon,
    boardLocked,
    ollamaModels,
    selectedModel,
    ollamaState,
    aiDifficulty,
    aiMemoryLimit,
    statusMessage,
    aiMemorySummary,
    currentDifficultyLabel,
    turnLabel,
    setSelectedModel,
    setAiDifficulty,
    refreshModels,
    resetGame,
    handleCardClick,
  } = useMemoryGame()

  return (
    <main className="app-shell">
      <section className="game-panel">
        <GameHeader />

        <GameStats
          scores={scores}
          moves={moves}
          turnLabel={turnLabel}
          currentDifficultyLabel={currentDifficultyLabel}
          aiMemoryLimit={aiMemoryLimit}
        />

        <GameControls
          aiDifficulty={aiDifficulty}
          ollamaModels={ollamaModels}
          selectedModel={selectedModel}
          ollamaState={ollamaState}
          onDifficultyChange={setAiDifficulty}
          onModelChange={setSelectedModel}
          onRefreshModels={refreshModels}
          onResetGame={resetGame}
        />

        <AiStatusPanels
          hasWon={hasWon}
          statusMessage={statusMessage}
          ollamaError={ollamaState.error}
          aiMemoryLimit={aiMemoryLimit}
          aiMemorySummary={aiMemorySummary}
        />

        <MemoryBoard
          deck={deck}
          selectedIds={selectedIds}
          activePlayer={activePlayer}
          boardLocked={boardLocked}
          hasWon={hasWon}
          ollamaConnected={ollamaState.connected}
          onCardClick={handleCardClick}
        />
      </section>
    </main>
  )
}

export default App
