import type { OllamaModelOption } from './types'

export const OLLAMA_BASE_URL = import.meta.env.VITE_OLLAMA_BASE_URL || '/ollama'
export const OLLAMA_TARGET_LABEL =
  import.meta.env.VITE_OLLAMA_PROXY_TARGET || 'http://ai.turtleware.au:11434'
export const DEFAULT_MODEL = import.meta.env.VITE_OLLAMA_MODEL || ''

interface OllamaTagModel {
  name: string
}

interface OllamaShowDetails {
  parameter_size?: string
}

interface OllamaShowResponse {
  capabilities?: string[]
  details?: OllamaShowDetails
}

type OllamaModelDetails = OllamaTagModel & OllamaShowResponse

interface OllamaTagsResponse {
  models?: OllamaTagModel[]
}

interface SelectableModelsResult {
  installedModels: OllamaTagModel[]
  selectableModels: OllamaModelOption[]
}

function getOllamaCapabilities(modelDetails: Partial<OllamaModelDetails>): string[] {
  if (Array.isArray(modelDetails?.capabilities)) {
    return modelDetails.capabilities
  }

  return []
}

function isGenerationCapable(modelDetails: Partial<OllamaModelDetails>): boolean {
  const capabilities = getOllamaCapabilities(modelDetails)

  if (capabilities.length === 0) {
    return true
  }

  return capabilities.includes('completion')
}

function formatModelLabel(
  modelName: string,
  modelDetails: Partial<OllamaModelDetails>,
): string {
  const parameterSize = modelDetails?.details?.parameter_size
  const capabilities = getOllamaCapabilities(modelDetails)

  if (parameterSize && capabilities.length > 0) {
    return `${modelName} (${parameterSize}, ${capabilities.join(', ')})`
  }

  if (parameterSize) {
    return `${modelName} (${parameterSize})`
  }

  if (capabilities.length > 0) {
    return `${modelName} (${capabilities.join(', ')})`
  }

  return modelName
}

export async function fetchSelectableOllamaModels(): Promise<SelectableModelsResult> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`)

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}`)
  }

  const result = (await response.json()) as OllamaTagsResponse
  const installedModels = result.models || []
  const modelDetails = await Promise.all(
    installedModels.map(async (model) => {
      try {
        const detailResponse = await fetch(`${OLLAMA_BASE_URL}/api/show`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model.name,
          }),
        })

        if (!detailResponse.ok) {
          throw new Error(`Ollama returned ${detailResponse.status}`)
        }

        const details = (await detailResponse.json()) as OllamaShowResponse

        return {
          ...model,
          ...details,
        }
      } catch {
        return model
      }
    }),
  )

  const selectableModels = modelDetails
    .filter((model) => isGenerationCapable(model))
    .map((model) => ({
      name: model.name,
      label: formatModelLabel(model.name, model),
    }))

  return {
    installedModels,
    selectableModels,
  }
}
