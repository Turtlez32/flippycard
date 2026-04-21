import { MemoryCard } from './MemoryCard'

export function MemoryBoard({
  deck,
  selectedIds,
  activePlayer,
  boardLocked,
  hasWon,
  ollamaConnected,
  onCardClick,
}) {
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
