export function GameStats({
  scores,
  moves,
  turnLabel,
  currentDifficultyLabel,
  aiMemoryLimit,
}) {
  const stats = [
    { label: 'Your score', value: scores.human },
    { label: 'AI score', value: scores.ai },
    { label: 'Moves', value: moves },
    { label: 'Turn', value: turnLabel },
    { label: 'Difficulty', value: currentDifficultyLabel },
    { label: 'AI memory', value: `${aiMemoryLimit} tiles` },
  ]

  return (
    <div className="status-bar">
      {stats.map((stat) => (
        <div key={stat.label} className="stat">
          <span className="stat-label">{stat.label}</span>
          <strong>{stat.value}</strong>
        </div>
      ))}
    </div>
  )
}
