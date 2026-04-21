export type ActivePlayer = 'human' | 'ai'

export interface CardDefinition {
  id: string
  icon: string
  label: string
  accent: string
}

export interface DeckCard extends CardDefinition {
  instanceId: string
  matched: boolean
  slot: number
}

export interface AiMemoryEntry {
  slot: number
  id: string
  label: string
}

export interface Scores {
  human: number
  ai: number
}

export type AiDifficultyKey = 'easy' | 'medium' | 'hard'

export interface AiDifficultyConfig {
  label: string
  memoryLimit: number
  recallAccuracy: number
}

export interface OllamaModelOption {
  name: string
  label: string
}

export interface OllamaState {
  loading: boolean
  connected: boolean
  error: string
}

export interface UseMemoryGameResult {
  deck: DeckCard[]
  selectedIds: string[]
  scores: Scores
  moves: number
  activePlayer: ActivePlayer
  hasWon: boolean
  boardLocked: boolean
  ollamaModels: OllamaModelOption[]
  selectedModel: string
  ollamaState: OllamaState
  aiDifficulty: AiDifficultyKey
  aiMemoryLimit: number
  statusMessage: string
  aiMemorySummary: string
  currentDifficultyLabel: string
  turnLabel: string
  setSelectedModel: (model: string) => void
  setAiDifficulty: (difficulty: AiDifficultyKey) => void
  refreshModels: () => void
  resetGame: () => void
  handleCardClick: (cardId: string) => void
}
