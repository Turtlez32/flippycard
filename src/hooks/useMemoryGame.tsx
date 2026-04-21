import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import {
  AI_DIFFICULTIES,
  CARD_LIBRARY,
  DEFAULT_AI_DIFFICULTY,
} from '../lib/gameConfig'
import {
  createDeck,
  getKnownPair,
  parseAiPick,
  pickRandomCard,
} from '../lib/gameUtils'
import {
  DEFAULT_MODEL,
  OLLAMA_BASE_URL,
  OLLAMA_TARGET_LABEL,
  fetchSelectableOllamaModels,
} from '../lib/ollama'
import type {
  ActivePlayer,
  AiDifficultyKey,
  AiMemoryEntry,
  DeckCard,
  OllamaModelOption,
  OllamaState,
  Scores,
  UseMemoryGameResult,
} from '../lib/types'

interface AiPickOptions {
  firstReveal?: DeckCard | null
  excludedSlots?: number[]
  onFallback?: () => void
}

interface ResolveAttemptOptions {
  firstCard: DeckCard
  secondCard: DeckCard
  player: ActivePlayer
}

export function useMemoryGame(): UseMemoryGameResult {
  const [deck, setDeck] = useState<DeckCard[]>(() => createDeck())
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [moves, setMoves] = useState(0)
  const [scores, setScores] = useState<Scores>({ human: 0, ai: 0 })
  const [activePlayer, setActivePlayer] = useState<ActivePlayer>('human')
  const [boardLocked, setBoardLocked] = useState(false)
  const [statusMessage, setStatusMessage] = useState(
    'Connecting to Ollama. The AI will join once a model is ready.',
  )
  const [ollamaModels, setOllamaModels] = useState<OllamaModelOption[]>([])
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL)
  const [aiDifficulty, setAiDifficulty] =
    useState<AiDifficultyKey>(DEFAULT_AI_DIFFICULTY)
  const [ollamaState, setOllamaState] = useState<OllamaState>({
    loading: true,
    connected: false,
    error: '',
  })
  const [aiMemory, setAiMemory] = useState<AiMemoryEntry[]>([])

  const deckRef = useRef<DeckCard[]>(deck)
  const aiMemoryRef = useRef<AiMemoryEntry[]>(aiMemory)
  const timeoutsRef = useRef<number[]>([])
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
  const aiMemorySummary =
    aiMemory.length === 0
      ? 'AI memory is empty right now.'
      : `AI remembers ${aiMemory.length} of ${aiMemoryLimit} recent tiles.`
  const currentDifficultyLabel = currentDifficulty.label
  const turnLabel = hasWon
    ? 'Complete'
    : activePlayer === 'human'
      ? 'You'
      : 'AI'

  const clearPendingWork = useCallback((): void => {
    for (const timeoutId of timeoutsRef.current) {
      window.clearTimeout(timeoutId)
    }

    timeoutsRef.current = []
    runVersionRef.current += 1
    aiRunningRef.current = false
  }, [])

  useEffect(() => clearPendingWork, [clearPendingWork])

  const schedule = useCallback((callback: () => void, delay: number): void => {
    const timeoutId = window.setTimeout(() => {
      timeoutsRef.current = timeoutsRef.current.filter((id) => id !== timeoutId)
      callback()
    }, delay)

    timeoutsRef.current.push(timeoutId)
  }, [])

  const pause = useCallback(
    (delay: number, expectedVersion: number): Promise<boolean> =>
      new Promise((resolve) => {
        schedule(() => resolve(expectedVersion === runVersionRef.current), delay)
      }),
    [schedule],
  )

  const rememberCards = useCallback(
    (cards: DeckCard[]): void => {
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
    },
    [aiMemoryLimit],
  )

  const forgetCards = useCallback((cards: DeckCard[]): void => {
    const forgottenSlots = new Set(cards.map((card) => card.slot))

    setAiMemory((currentMemory) =>
      currentMemory.filter((entry) => !forgottenSlots.has(entry.slot)),
    )
  }, [])

  const getVisibleMemoryEntries = useCallback(
    (excludedSlots: number[] = []): AiMemoryEntry[] =>
      aiMemoryRef.current.filter((entry) => !excludedSlots.includes(entry.slot)),
    [],
  )

  const chooseMistakenCard = useCallback(
    (availableCards: DeckCard[], excludedSlots: number[] = []): DeckCard | null => {
      const mistakenCards = availableCards.filter(
        (card) => !excludedSlots.includes(card.slot),
      )

      return pickRandomCard(
        mistakenCards.length > 0 ? mistakenCards : availableCards,
      )
    },
    [],
  )

  const getCardById = useCallback(
    (cardId: string, sourceDeck: DeckCard[] = deckRef.current): DeckCard | undefined =>
      sourceDeck.find((card) => card.instanceId === cardId),
    [],
  )

  const getAvailableCards = useCallback(
    (sourceDeck: DeckCard[], excludedSlots: number[] = []): DeckCard[] =>
      sourceDeck.filter(
        (card) => !card.matched && !excludedSlots.includes(card.slot),
      ),
    [],
  )

  const requestAiPick = useCallback(
    async ({
      firstReveal = null,
      excludedSlots = [],
      onFallback,
    }: AiPickOptions): Promise<DeckCard | null> => {
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

        const result = (await response.json()) as { response?: string }
        const chosenSlot = parseAiPick(result.response || '', availableSlots)
        const chosenCard = availableCards.find((card) => card.slot === chosenSlot)

        if (chosenCard) {
          return chosenCard
        }
      } catch {
        onFallback?.()
      }

      return pickRandomCard(availableCards)
    },
    [
      aiMemoryLimit,
      aiRecallAccuracy,
      chooseMistakenCard,
      getAvailableCards,
      getVisibleMemoryEntries,
      selectedModel,
    ],
  )

  const resetGame = useCallback((): void => {
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
  }, [clearPendingWork, ollamaState.connected])

  const resolveAttempt = useCallback(
    ({ firstCard, secondCard, player }: ResolveAttemptOptions): void => {
      const playerLabel = player === 'human' ? 'You' : 'AI'
      const nextPlayer: ActivePlayer = player === 'human' ? 'ai' : 'human'
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
          `${playerLabel} matched ${firstCard.label}. ${
            nextPlayer === 'human' ? 'Your turn next.' : 'AI is next.'
          }`,
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
    },
    [forgetCards, rememberCards, schedule],
  )

  const handleCardClick = useCallback(
    (cardId: string): void => {
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
    },
    [
      activePlayer,
      boardLocked,
      getCardById,
      hasWon,
      ollamaState.connected,
      rememberCards,
      resolveAttempt,
      selectedIds,
    ],
  )

  const pauseForAi = useEffectEvent((delay: number, expectedVersion: number) =>
    pause(delay, expectedVersion),
  )
  const rememberAiCards = useEffectEvent((cards: DeckCard[]) => rememberCards(cards))
  const pickAiCard = useEffectEvent((options: AiPickOptions) => requestAiPick(options))
  const resolveAiAttempt = useEffectEvent((attempt: ResolveAttemptOptions) =>
    resolveAttempt(attempt),
  )

  const loadModels = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}): Promise<void> => {
      if (!silent) {
        setOllamaState({ loading: true, connected: false, error: '' })
      } else {
        setOllamaState((currentState) => ({
          ...currentState,
          loading: true,
          error: '',
        }))
      }

      try {
        const { installedModels, selectableModels } =
          await fetchSelectableOllamaModels()

        setOllamaModels(selectableModels)
        setSelectedModel((currentModel: string) => {
          if (
            currentModel &&
            selectableModels.some((model) => model.name === currentModel)
          ) {
            return currentModel
          }

          return selectableModels[0]?.name || ''
        })
        setOllamaState({
          loading: false,
          connected: selectableModels.length > 0,
          error:
            installedModels.length === 0
              ? 'No Ollama models found.'
              : selectableModels.length === 0
                ? 'Installed Ollama models are not chat/generation capable.'
                : '',
        })
        setStatusMessage(
          selectableModels.length > 0
            ? 'Ollama is ready. Your turn to flip the opening card.'
            : installedModels.length === 0
              ? 'Ollama responded, but no models are installed.'
              : 'Ollama responded, but no generation-capable models are available for AI play.',
        )
      } catch {
        setOllamaModels([])
        setSelectedModel('')
        setOllamaState({
          loading: false,
          connected: false,
          error: `Could not reach Ollama at ${OLLAMA_TARGET_LABEL}.`,
        })
        setStatusMessage(
          'The AI could not connect. Check the proxy target or enable CORS.',
        )
      }
    },
    [],
  )

  useEffect(() => {
    void loadModels()
  }, [loadModels])

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

    const runAiTurn = async (): Promise<void> => {
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

  return {
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
    refreshModels: () => {
      void loadModels({ silent: true })
    },
    resetGame,
    handleCardClick,
  }
}
