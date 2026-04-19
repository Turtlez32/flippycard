import { useEffect, useEffectEvent, useRef, useState } from 'react'
import './App.css'

const OLLAMA_BASE_URL = import.meta.env.VITE_OLLAMA_BASE_URL || '/ollama'
const OLLAMA_TARGET_LABEL =
  import.meta.env.VITE_OLLAMA_PROXY_TARGET || 'http://ai.turtleware.au:11434'
const DEFAULT_MODEL = import.meta.env.VITE_OLLAMA_MODEL || ''
const AI_DIFFICULTIES = {
  easy: {
    label: 'Easy',
    memoryLimit: 3,
    recallAccuracy: 0.7,
  },
  medium: {
    label: 'Medium',
    memoryLimit: 5,
    recallAccuracy: 0.76,
  },
  hard: {
    label: 'Hard',
    memoryLimit: 7,
    recallAccuracy: 0.9,
  },
}
const DEFAULT_AI_DIFFICULTY = 'easy'

const CARD_LIBRARY = [
  { id: 'aurora', icon: '🌈', label: 'Aurora', accent: '#ff7b72' },
  { id: 'rocket', icon: '🚀', label: 'Rocket', accent: '#f59e0b' },
  { id: 'pearl', icon: '🫧', label: 'Pearl', accent: '#38bdf8' },
  { id: 'leaf', icon: '🍃', label: 'Leaf', accent: '#4ade80' },
  { id: 'bolt', icon: '⚡', label: 'Bolt', accent: '#facc15' },
  { id: 'shell', icon: '🐚', label: 'Shell', accent: '#fb7185' },
  { id: 'planet', icon: '🪐', label: 'Planet', accent: '#a78bfa' },
  { id: 'cherry', icon: '🍒', label: 'Cherry', accent: '#ef4444' },
  { id: 'wave', icon: '🌊', label: 'Wave', accent: '#0ea5e9' },
  { id: 'bloom', icon: '🌼', label: 'Bloom', accent: '#f97316' },
]

function createDeck() {
  const duplicatedCards = CARD_LIBRARY.flatMap((card) => [
    { ...card, instanceId: `${card.id}-a`, matched: false },
    { ...card, instanceId: `${card.id}-b`, matched: false },
  ])

  for (let i = duplicatedCards.length - 1; i > 0; i -= 1) {
    const randomIndex = Math.floor(Math.random() * (i + 1))
    ;[duplicatedCards[i], duplicatedCards[randomIndex]] = [
      duplicatedCards[randomIndex],
      duplicatedCards[i],
    ]
  }

  return duplicatedCards.map((card, index) => ({
    ...card,
    slot: index + 1,
  }))
}

function pickRandomCard(cards) {
  if (cards.length === 0) {
    return null
  }

  const randomIndex = Math.floor(Math.random() * cards.length)
  return cards[randomIndex]
}

function getKnownPair(memoryEntries) {
  const seenByLabel = new Map()

  for (const entry of memoryEntries) {
    if (seenByLabel.has(entry.label)) {
      return [seenByLabel.get(entry.label), entry.slot]
    }

    seenByLabel.set(entry.label, entry.slot)
  }

  return null
}

function parseAiPick(rawResponse, availableSlots) {
  const matchedNumber = rawResponse.match(/\d+/)

  if (!matchedNumber) {
    return null
  }

  const parsedPick = Number(matchedNumber[0])

  return availableSlots.includes(parsedPick) ? parsedPick : null
}

function App() {
  const [deck, setDeck] = useState(() => createDeck())
  const [selectedIds, setSelectedIds] = useState([])
  const [moves, setMoves] = useState(0)
  const [scores, setScores] = useState({ human: 0, ai: 0 })
  const [activePlayer, setActivePlayer] = useState('human')
  const [boardLocked, setBoardLocked] = useState(false)
  const [statusMessage, setStatusMessage] = useState(
    'Connecting to Ollama. The AI will join once a model is ready.',
  )
  const [ollamaModels, setOllamaModels] = useState([])
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL)
  const [aiDifficulty, setAiDifficulty] = useState(DEFAULT_AI_DIFFICULTY)
  const [ollamaState, setOllamaState] = useState({
    loading: true,
    connected: false,
    error: '',
  })
  const [aiMemory, setAiMemory] = useState([])

  const deckRef = useRef(deck)
  const aiMemoryRef = useRef(aiMemory)
  const timeoutsRef = useRef([])
  const runVersionRef = useRef(0)
  const aiRunningRef = useRef(false)

  deckRef.current = deck
  aiMemoryRef.current = aiMemory

  const currentDifficulty = AI_DIFFICULTIES[aiDifficulty]
  const aiMemoryLimit = currentDifficulty.memoryLimit
  const aiRecallAccuracy = currentDifficulty.recallAccuracy

  const matchedPairs = scores.human + scores.ai
  const hasWon = matchedPairs === CARD_LIBRARY.length
  const winnerLabel =
    scores.human === scores.ai
      ? 'Draw game.'
      : scores.human > scores.ai
        ? 'You beat the AI.'
        : 'The AI wins this round.'

  const clearPendingWork = () => {
    for (const timeoutId of timeoutsRef.current) {
      window.clearTimeout(timeoutId)
    }

    timeoutsRef.current = []
    runVersionRef.current += 1
    aiRunningRef.current = false
  }

  useEffect(() => clearPendingWork, [])

  const schedule = (callback, delay) => {
    const timeoutId = window.setTimeout(() => {
      timeoutsRef.current = timeoutsRef.current.filter((id) => id !== timeoutId)
      callback()
    }, delay)

    timeoutsRef.current.push(timeoutId)
  }

  const pause = (delay, expectedVersion) =>
    new Promise((resolve) => {
      schedule(() => resolve(expectedVersion === runVersionRef.current), delay)
    })

  const rememberCards = (cards) => {
    setAiMemory((currentMemory) => {
      let nextMemory = [...currentMemory]

      for (const card of cards) {
        nextMemory = nextMemory.filter((entry) => entry.slot !== card.slot)
        nextMemory.push({
          slot: card.slot,
          id: card.id,
          label: card.label,
        })
      }

      return nextMemory.slice(-aiMemoryLimit)
    })
  }

  const forgetCards = (cards) => {
    const forgottenSlots = new Set(cards.map((card) => card.slot))

    setAiMemory((currentMemory) =>
      currentMemory.filter((entry) => !forgottenSlots.has(entry.slot)),
    )
  }

  const getVisibleMemoryEntries = (excludedSlots = []) =>
    aiMemoryRef.current.filter((entry) => !excludedSlots.includes(entry.slot))

  const chooseMistakenCard = (availableCards, excludedSlots = []) => {
    const mistakenCards = availableCards.filter(
      (card) => !excludedSlots.includes(card.slot),
    )

    return pickRandomCard(mistakenCards.length > 0 ? mistakenCards : availableCards)
  }

  const getAiMemorySummary = () =>
    aiMemoryRef.current.length === 0
      ? 'AI memory is empty right now.'
      : `AI remembers ${aiMemoryRef.current.length} of ${aiMemoryLimit} recent tiles.`

  const getCardById = (cardId, sourceDeck = deckRef.current) =>
    sourceDeck.find((card) => card.instanceId === cardId)

  const getAvailableCards = (sourceDeck, excludedSlots = []) =>
    sourceDeck.filter(
      (card) => !card.matched && !excludedSlots.includes(card.slot),
    )

  const requestAiPick = async ({
    firstReveal = null,
    excludedSlots = [],
    onFallback,
  }) => {
    const availableCards = getAvailableCards(deckRef.current, excludedSlots)
    const availableSlots = availableCards.map((card) => card.slot)
    const memoryEntries = getVisibleMemoryEntries(excludedSlots)

    if (availableCards.length === 0) {
      return null
    }

    if (firstReveal) {
      const knownMatch = memoryEntries.find(
        (entry) =>
          entry.label === firstReveal.label && entry.slot !== firstReveal.slot,
      )
      const guaranteedCard = availableCards.find(
        (card) => card.slot === knownMatch?.slot,
      )

      if (guaranteedCard) {
        return Math.random() < aiRecallAccuracy
          ? guaranteedCard
          : chooseMistakenCard(availableCards, [guaranteedCard.slot])
      }
    } else {
      const knownPair = getKnownPair(memoryEntries)

      if (knownPair) {
        const guaranteedCard = availableCards.find(
          (card) => card.slot === knownPair[0],
        )

        if (guaranteedCard) {
          return Math.random() < aiRecallAccuracy
            ? guaranteedCard
            : chooseMistakenCard(availableCards, knownPair)
        }
      }
    }

    const memorySnapshot = memoryEntries.map(({ slot, label }) => ({
      position: slot,
      label,
    }))

    const promptLines = [
      'You are the AI player in a fair memory matching game with imperfect recall.',
      'Choose exactly one card position to flip next.',
      `You only remember the last ${aiMemoryLimit} unmatched tiles you have seen.`,
      'If not, make the best guess from the available positions.',
      'Return only the position number. No words, no JSON, no explanation.',
      `available_positions: [${availableSlots.join(', ')}]`,
      `known_unmatched_memory: ${JSON.stringify(memorySnapshot)}`,
      `first_reveal_this_turn: ${
        firstReveal
          ? JSON.stringify({
              position: firstReveal.slot,
              label: firstReveal.label,
            })
          : 'null'
      }`,
    ]

    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          prompt: promptLines.join('\n'),
          stream: false,
          options: {
            temperature: 0,
          },
        }),
      })

      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}`)
      }

      const result = await response.json()
      const chosenSlot = parseAiPick(result.response || '', availableSlots)
      const chosenCard = availableCards.find((card) => card.slot === chosenSlot)

      if (chosenCard) {
        return chosenCard
      }
    } catch {
      if (typeof onFallback === 'function') {
        onFallback()
      }
    }

    return pickRandomCard(availableCards)
  }

  const resetGame = () => {
    clearPendingWork()
    setDeck(createDeck())
    setSelectedIds([])
    setMoves(0)
    setScores({ human: 0, ai: 0 })
    setAiMemory([])
    setActivePlayer('human')
    setBoardLocked(false)
    setStatusMessage(
      ollamaState.connected
        ? 'New board ready. Your turn to open the match.'
        : 'Waiting for Ollama before starting a versus round.',
    )
  }

  const resolveAttempt = ({ firstCard, secondCard, player }) => {
    const playerLabel = player === 'human' ? 'You' : 'AI'
    const nextPlayer = player === 'human' ? 'ai' : 'human'
    const isMatch = firstCard.id === secondCard.id

    rememberCards([firstCard, secondCard])
    setSelectedIds([firstCard.instanceId, secondCard.instanceId])
    setMoves((currentMoves) => currentMoves + 1)
    setBoardLocked(true)

    if (isMatch) {
      forgetCards([firstCard, secondCard])
      setDeck((currentDeck) =>
        currentDeck.map((card) =>
          card.id === firstCard.id ? { ...card, matched: true } : card,
        ),
      )
      setScores((currentScores) => ({
        ...currentScores,
        [player]: currentScores[player] + 1,
      }))
      setStatusMessage(
        `${playerLabel} matched ${firstCard.label}. ${nextPlayer === 'human' ? 'Your turn next.' : 'AI is next.'}`,
      )

      schedule(() => {
        setSelectedIds([])
        setBoardLocked(false)
        setActivePlayer(nextPlayer)

        if (!deckRef.current.every((card) => card.matched)) {
          setStatusMessage(
            nextPlayer === 'human'
              ? 'Your turn. Matches no longer give bonus turns.'
              : 'AI gets one normal turn. Matches no longer chain.',
          )
        }
      }, 950)

      return
    }

    setStatusMessage(
      player === 'human'
        ? `${firstCard.label} and ${secondCard.label} miss. AI is next.`
        : `AI missed with ${firstCard.label} and ${secondCard.label}. Your turn.`,
    )

    schedule(() => {
      setSelectedIds([])
      setBoardLocked(false)
      setActivePlayer(nextPlayer)
      setStatusMessage(
        nextPlayer === 'human'
          ? 'Your turn. Flip the next card.'
          : 'AI is getting ready for its turn.',
      )
    }, 1300)
  }

  const handleCardClick = (cardId) => {
    if (
      activePlayer !== 'human' ||
      boardLocked ||
      hasWon ||
      !ollamaState.connected
    ) {
      return
    }

    const chosenCard = getCardById(cardId)

    if (!chosenCard || chosenCard.matched || selectedIds.includes(cardId)) {
      return
    }

    rememberCards([chosenCard])

    if (selectedIds.length === 0) {
      setSelectedIds([cardId])
      setStatusMessage(`You revealed ${chosenCard.label}. Pick one more card.`)
      return
    }

    const firstCard = getCardById(selectedIds[0])

    if (!firstCard) {
      setSelectedIds([cardId])
      setStatusMessage(`You revealed ${chosenCard.label}. Pick one more card.`)
      return
    }

    resolveAttempt({
      firstCard,
      secondCard: chosenCard,
      player: 'human',
    })
  }

  const pauseForAi = useEffectEvent((delay, expectedVersion) =>
    pause(delay, expectedVersion),
  )
  const rememberAiCards = useEffectEvent((cards) => rememberCards(cards))
  const pickAiCard = useEffectEvent((options) => requestAiPick(options))
  const resolveAiAttempt = useEffectEvent((attempt) => resolveAttempt(attempt))

  useEffect(() => {
    let isActive = true

    const loadModels = async () => {
      setOllamaState({ loading: true, connected: false, error: '' })

      try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`)

        if (!response.ok) {
          throw new Error(`Ollama returned ${response.status}`)
        }

        const result = await response.json()
        const modelNames = (result.models || []).map((model) => model.name)

        if (!isActive) {
          return
        }

        setOllamaModels(modelNames)
        setSelectedModel((currentModel) => {
          if (currentModel && modelNames.includes(currentModel)) {
            return currentModel
          }

          return modelNames[0] || ''
        })
        setOllamaState({
          loading: false,
          connected: modelNames.length > 0,
          error: modelNames.length === 0 ? 'No Ollama models found.' : '',
        })
        setStatusMessage(
          modelNames.length > 0
            ? 'Ollama is ready. Your turn to flip the opening card.'
            : 'Ollama responded, but no models are installed.',
        )
      } catch {
        if (!isActive) {
          return
        }

        setOllamaModels([])
        setOllamaState({
          loading: false,
          connected: false,
          error: `Could not reach Ollama at ${OLLAMA_TARGET_LABEL}.`,
        })
        setStatusMessage(
          'The AI could not connect. Check the proxy target or enable CORS.',
        )
      }
    }

    loadModels()

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    setAiMemory((currentMemory) => currentMemory.slice(-aiMemoryLimit))
  }, [aiMemoryLimit])

  useEffect(() => {
    if (!hasWon) {
      return
    }

    aiRunningRef.current = false
    setStatusMessage(`All pairs cleared. ${winnerLabel}`)
  }, [hasWon, winnerLabel])

  useEffect(() => {
    if (
      activePlayer !== 'ai' ||
      boardLocked ||
      hasWon ||
      !ollamaState.connected ||
      !selectedModel ||
      aiRunningRef.current
    ) {
      return
    }

    aiRunningRef.current = true
    const expectedVersion = runVersionRef.current

    const runAiTurn = async () => {
      setBoardLocked(true)
      setStatusMessage('AI is thinking about the first flip...')

      const firstStepReady = await pauseForAi(550, expectedVersion)

      if (!firstStepReady) {
        return
      }

      const firstCard = await pickAiCard({
        onFallback: () => {
          setStatusMessage('AI fell back to a random first pick.')
        },
      })

      if (!firstCard || expectedVersion !== runVersionRef.current) {
        return
      }

      rememberAiCards([firstCard])
      setSelectedIds([firstCard.instanceId])
      setStatusMessage(
        `AI flipped position ${firstCard.slot} and found ${firstCard.label}.`,
      )

      const secondStepReady = await pauseForAi(900, expectedVersion)

      if (!secondStepReady) {
        return
      }

      const secondCard = await pickAiCard({
        firstReveal: firstCard,
        excludedSlots: [firstCard.slot],
        onFallback: () => {
          setStatusMessage('AI fell back to a random second pick.')
        },
      })

      if (!secondCard || expectedVersion !== runVersionRef.current) {
        return
      }

      aiRunningRef.current = false
      resolveAiAttempt({
        firstCard,
        secondCard,
        player: 'ai',
      })
    }

    runAiTurn().catch(() => {
      aiRunningRef.current = false
      setBoardLocked(false)
      setActivePlayer('human')
      setStatusMessage('AI move failed. The turn has been handed back to you.')
    })
  }, [
    activePlayer,
    boardLocked,
    hasWon,
    ollamaState.connected,
    selectedModel,
  ])

  return (
    <main className="app-shell">
      <section className="game-panel">
        <div className="hero-copy">
          <p className="eyebrow">Flippy Card Versus AI</p>
          <h1>Take turns with an Ollama bot and race to claim the most pairs.</h1>
          <p className="intro">
            Easy mode keeps the current balance with 3 remembered tiles.
            Medium raises the AI to 5 tiles. Hard now gets 7 remembered tiles
            and stronger recall, so it should pressure the player more. Every
            scored match still passes the turn across. The game ends when all
            10 pairs are gone.
          </p>
        </div>

        <div className="status-bar">
          <div className="stat">
            <span className="stat-label">Your score</span>
            <strong>{scores.human}</strong>
          </div>
          <div className="stat">
            <span className="stat-label">AI score</span>
            <strong>{scores.ai}</strong>
          </div>
          <div className="stat">
            <span className="stat-label">Moves</span>
            <strong>{moves}</strong>
          </div>
          <div className="stat">
            <span className="stat-label">Turn</span>
            <strong>{hasWon ? 'Complete' : activePlayer === 'human' ? 'You' : 'AI'}</strong>
          </div>
          <div className="stat">
            <span className="stat-label">Difficulty</span>
            <strong>{currentDifficulty.label}</strong>
          </div>
          <div className="stat">
            <span className="stat-label">AI memory</span>
            <strong>{aiMemoryLimit} tiles</strong>
          </div>
        </div>

        <div className="controls-panel">
          <label className="model-picker">
            <span>AI difficulty</span>
            <select
              value={aiDifficulty}
              onChange={(event) => setAiDifficulty(event.target.value)}
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
              onChange={(event) => setSelectedModel(event.target.value)}
              disabled={ollamaState.loading || ollamaModels.length === 0}
            >
              {ollamaModels.length === 0 ? (
                <option value="">No models available</option>
              ) : (
                ollamaModels.map((modelName) => (
                  <option key={modelName} value={modelName}>
                    {modelName}
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
            <p className="connection-note">Proxy target: {OLLAMA_TARGET_LABEL}</p>
          </div>

          <button type="button" className="reset-button" onClick={resetGame}>
            Shuffle again
          </button>
        </div>

        <div
          className={`banner ${hasWon ? '' : 'banner-muted'}`}
          role="status"
          aria-live="polite"
        >
          <strong>{statusMessage}</strong>
          <span className="banner-detail">{getAiMemorySummary()}</span>
          {ollamaState.error ? (
            <span className="banner-detail">{ollamaState.error}</span>
          ) : null}
        </div>

        <section className="card-grid" aria-label="Memory game board">
          {deck.map((card) => {
            const isFlipped =
              card.matched || selectedIds.includes(card.instanceId)

            return (
              <button
                key={card.instanceId}
                type="button"
                className={`memory-card ${isFlipped ? 'is-flipped' : ''} ${
                  card.matched ? 'is-matched' : ''
                }`}
                onClick={() => handleCardClick(card.instanceId)}
                aria-label={
                  isFlipped
                    ? `${card.label} at position ${card.slot}`
                    : `Hidden memory card at position ${card.slot}`
                }
                aria-pressed={isFlipped}
                disabled={
                  boardLocked ||
                  card.matched ||
                  activePlayer !== 'human' ||
                  !ollamaState.connected
                }
                style={{ '--card-accent': card.accent }}
              >
                <span className="memory-card-inner">
                  <span className="memory-card-face memory-card-back">
                    <span className="back-slot">{card.slot}</span>
                    <span className="back-mark">?</span>
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
          })}
        </section>
      </section>
    </main>
  )
}

export default App
