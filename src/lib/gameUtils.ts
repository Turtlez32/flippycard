import { CARD_LIBRARY } from './gameConfig'
import type { AiMemoryEntry, DeckCard } from './types'

export function createDeck(): DeckCard[] {
  const duplicatedCards: Array<Omit<DeckCard, 'slot'>> = CARD_LIBRARY.flatMap((card) => [
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

export function pickRandomCard(cards: DeckCard[]): DeckCard | null {
  if (cards.length === 0) {
    return null
  }

  const randomIndex = Math.floor(Math.random() * cards.length)
  return cards[randomIndex]
}

export function getKnownPair(
  memoryEntries: AiMemoryEntry[],
): [number, number] | null {
  const seenByLabel = new Map<string, number>()

  for (const entry of memoryEntries) {
    const firstSlot = seenByLabel.get(entry.label)

    if (firstSlot !== undefined) {
      return [firstSlot, entry.slot]
    }

    seenByLabel.set(entry.label, entry.slot)
  }

  return null
}

export function parseAiPick(
  rawResponse: string,
  availableSlots: number[],
): number | null {
  const matchedNumber = rawResponse.match(/\d+/)

  if (!matchedNumber) {
    return null
  }

  const parsedPick = Number(matchedNumber[0])

  return availableSlots.includes(parsedPick) ? parsedPick : null
}
