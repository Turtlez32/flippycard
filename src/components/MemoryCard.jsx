export function MemoryCard({ card, isFlipped, disabled, onClick }) {
  return (
    <button
      type="button"
      className={`memory-card ${isFlipped ? 'is-flipped' : ''} ${
        card.matched ? 'is-matched' : ''
      }`}
      onClick={() => onClick(card.instanceId)}
      aria-label={
        isFlipped
          ? `${card.label} at position ${card.slot}`
          : `Hidden memory card at position ${card.slot}`
      }
      aria-pressed={isFlipped}
      disabled={disabled}
      style={{ '--card-accent': card.accent }}
    >
      <span className="memory-card-inner">
        <span className="memory-card-face memory-card-back">
          <span className="back-slot">{card.slot}</span>
        </span>
        <span className="memory-card-face memory-card-front">
          <span className="card-icon" aria-hidden="true">
            {card.icon}
          </span>
          <span className="card-label">{card.label}</span>
          <span className="card-slot">Pos {card.slot}</span>
        </span>
      </span>
    </button>
  )
}
