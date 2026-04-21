import { MemoryCard } from './MemoryCard'
import type { ActivePlayer, DeckCard } from '../lib/types'

interface MemoryBoardProps {
  deck: DeckCard[]
  selectedIds: string[]
  activePlayer: ActivePlayer
  boardLocked: boolean
  hasWon: boolean
  ollamaConnected: boolean
  onCardClick: (cardId: string) => void
}

export function MemoryBoard({
  deck,
  selectedIds,
  activePlayer,
  boardLocked,
  hasWon,
  ollamaConnected,
  onCardClick,
}: MemoryBoardProps) {
  return (
    <section className="card-grid" aria-label="Memory game board">
      {deck.map((card) => (
        <MemoryCard
          key={card.instanceId}
          card={card}
          isFlipped={card.matched || selectedIds.includes(card.instanceId)}
          disabled={
            boardLocked ||
            card.matched ||
            hasWon ||
            activePlayer !== 'human' ||
            !ollamaConnected
          }
          onClick={onCardClick}
        />
      ))}
    </section>
  )
}
