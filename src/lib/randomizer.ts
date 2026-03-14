const CHEERPJ_LOADER_URL = 'https://cjrtnc.leaningtech.com/2.3/loader.js'
const EMULATOR_HEAP_GLOBAL_KEYS = [
  'HEAP8',
  'HEAP16',
  'HEAP32',
  'HEAP64',
  'HEAPU8',
  'HEAPU16',
  'HEAPU32',
  'HEAPU64',
  'HEAPF32',
  'HEAPF64',
] as const

export type RandomizerPresetId = 'classic' | 'balanced' | 'chaos'

export interface RandomizerPreset {
  id: RandomizerPresetId
  label: string
  description: string
  settingsPath: string
}

export const RANDOMIZER_PRESETS: RandomizerPreset[] = [
  {
    id: 'classic',
    label: 'Classic Randomizer',
    description: 'Random starters, wilds, trainers, and statics without the full chaos stack.',
    settingsPath: 'randomizer/settings/classic.rnqs',
  },
  {
    id: 'balanced',
    label: 'Balanced Randomizer',
    description: 'A steadier preset with more guardrails than classic while still reshuffling the run.',
    settingsPath: 'randomizer/settings/balanced.rnqs',
  },
  {
    id: 'chaos',
    label: 'Chaos Randomizer',
    description: 'The loud upstream race preset with far less balance protection.',
    settingsPath: 'randomizer/settings/chaos.rnqs',
  },
]

function getRandomizerJarUrl(): string {
  return `${import.meta.env.BASE_URL.replace(/^\//, '')}randomizer/dist/randomizer.jar`
}

declare global {
  interface Window {
    cheerpjInit?: () => Promise<void>
    cheerpjCreateDisplay?: (width: number, height: number, element?: Element) => Promise<void> | void
    cheerpjRunJar?: (path: string, ...args: string[]) => Promise<void> | void
    cheerpjAddStringFile?: (path: string, data: Uint8Array) => void
    cjFileBlob?: (path: string) => Promise<Blob | null>
    cjNew?: (className: string, ...args: unknown[]) => Promise<unknown>
    cjCall?: (instance: unknown, methodName: string, ...args: unknown[]) => Promise<unknown>
  }
}

let loaderPromise: Promise<void> | null = null
let runtimePromise: Promise<void> | null = null
let emulatorHeapGlobalsSnapshot: Partial<Record<(typeof EMULATOR_HEAP_GLOBAL_KEYS)[number], unknown>> | null = null

export async function randomizeRom({
  romData,
  romName,
  preset,
  onStatus,
}: {
  romData: Uint8Array
  romName: string
  preset: RandomizerPresetId
  onStatus?: (message: string) => void
}): Promise<{ fileName: string; fileData: Uint8Array; presetLabel: string }> {
  try {
    const presetConfig = RANDOMIZER_PRESETS.find((option) => option.id === preset)
    if (!presetConfig) {
      throw new Error('Unknown randomizer preset.')
    }

    onStatus?.('Preparing the browser randomizer...')
    await ensureRuntimeReady()
    await clearRandomizerStorage()

    if (!window.cheerpjAddStringFile || !window.cjNew || !window.cjCall || !window.cjFileBlob) {
      throw new Error('The browser randomizer API did not initialize correctly.')
    }

    const sourceFileName = buildSourceFileName(romName)
    const outputFileName = buildOutputFileName(romName, preset)
    const mountedSourcePath = `/str/${sourceFileName}`
    const workingSourcePath = `/files/${sourceFileName}`
    const outputPath = `/files/${outputFileName}`
    const settingsPath = `/str/settings/${presetConfig.id}.rnqs`

    onStatus?.(`Applying ${presetConfig.label}...`)
    onStatus?.('Loading preset settings...')
    const settingsBytes = await loadPresetSettings(presetConfig.settingsPath)
    window.cheerpjAddStringFile(settingsPath, settingsBytes)
    window.cheerpjAddStringFile(mountedSourcePath, romData)

    const settingsStream = await window.cjNew('java.io.FileInputStream', settingsPath)
    const javaSettings = await window.cjCall('com.dabomstew.pkrandom.Settings', 'read', settingsStream)
    const customNames = await window.cjCall('com.dabomstew.pkrandom.FileFunctions', 'getCustomNames')
    await window.cjCall(javaSettings, 'setCustomNames', customNames)

    onStatus?.('Preparing Java randomizer state...')
    const sourceBytes = await window.cjCall('com.dabomstew.pkrandom.FileFunctions', 'readFileFullyIntoBuffer', mountedSourcePath)
    await window.cjCall('com.dabomstew.pkrandom.FileFunctions', 'writeBytesToFile', workingSourcePath, sourceBytes)
    const javaRandom = await window.cjNew('java.util.Random')
    const romHandler = await window.cjNew('com.dabomstew.pkrandom.romhandlers.Gen4RomHandler', javaRandom)
    onStatus?.('Loading the Platinum ROM into the randomizer...')
    await window.cjCall(romHandler, 'loadRom', workingSourcePath)

    onStatus?.('Tweaking preset compatibility for Platinum...')
    await window.cjCall(javaSettings, 'tweakForRom', romHandler)
    onStatus?.('Creating the randomizer session...')
    const randomizer = await window.cjNew('com.dabomstew.pkrandom.Randomizer', javaSettings, romHandler)

    onStatus?.('Generating a fresh randomized Platinum ROM...')
    await window.cjCall(randomizer, 'randomize', outputPath)

    const fileBlob = await waitForRandomizedFile(outputPath)
    const fileData = new Uint8Array(await fileBlob.arrayBuffer())

    return {
      fileName: outputFileName,
      fileData,
      presetLabel: presetConfig.label,
    }
  } finally {
    restoreEmulatorHeapGlobals()
  }
}

function buildSourceFileName(romName: string): string {
  return `${romName.replace(/\.nds$/i, '')}-source.nds`
}

function buildOutputFileName(romName: string, preset: RandomizerPresetId): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${romName.replace(/\.nds$/i, '')}-${preset}-${stamp}.nds`
}

function injectLoaderScript(): Promise<void> {
  if (loaderPromise) {
    return loaderPromise
  }

  loaderPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-cheerpj-loader="true"]')
    if (existing) {
      if (window.cheerpjInit) {
        resolve()
        return
      }

      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Could not load the browser randomizer runtime.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = CHEERPJ_LOADER_URL
    script.async = true
    script.dataset.cheerpjLoader = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load the browser randomizer runtime.'))
    document.head.appendChild(script)
  })

  return loaderPromise
}

async function ensureRuntimeReady(): Promise<void> {
  if (runtimePromise) {
    return runtimePromise
  }

  runtimePromise = (async () => {
    captureEmulatorHeapGlobals()

    try {
      await injectLoaderScript()

      if (!window.cheerpjInit || !window.cheerpjCreateDisplay || !window.cheerpjRunJar) {
        throw new Error('The browser randomizer runtime is unavailable.')
      }

      await window.cheerpjInit()

      let host = document.getElementById('randomizer-runtime')
      if (!host) {
        host = document.createElement('div')
        host.id = 'randomizer-runtime'
        host.setAttribute('aria-hidden', 'true')
        host.style.position = 'fixed'
        host.style.width = '1px'
        host.style.height = '1px'
        host.style.overflow = 'hidden'
        host.style.opacity = '0'
        host.style.pointerEvents = 'none'
        host.style.bottom = '0'
        host.style.left = '0'
        document.body.appendChild(host)
        await window.cheerpjCreateDisplay(1, 1, host)
        await window.cheerpjRunJar(getRandomizerJarUrl(), '--noupdate')
      }

      await waitForClassAvailability()
    } finally {
      restoreEmulatorHeapGlobals()
    }
  })()

  return runtimePromise
}

function captureEmulatorHeapGlobals(): void {
  if (emulatorHeapGlobalsSnapshot) {
    return
  }

  const globalWindow = window as unknown as Record<string, unknown>
  emulatorHeapGlobalsSnapshot = {}

  for (const key of EMULATOR_HEAP_GLOBAL_KEYS) {
    emulatorHeapGlobalsSnapshot[key] = globalWindow[key]
  }
}

function restoreEmulatorHeapGlobals(): void {
  if (!emulatorHeapGlobalsSnapshot) {
    return
  }

  const globalWindow = window as unknown as Record<string, unknown>

  for (const key of EMULATOR_HEAP_GLOBAL_KEYS) {
    const value = emulatorHeapGlobalsSnapshot[key]
    if (value !== undefined) {
      globalWindow[key] = value
    }
  }
}

async function waitForClassAvailability(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await window.cjNew?.('java.util.Random')
      return
    } catch {
      await new Promise((resolve) => window.setTimeout(resolve, 250))
    }
  }

  throw new Error('The browser randomizer runtime did not finish loading.')
}

async function loadPresetSettings(path: string): Promise<Uint8Array> {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`)
  if (!response.ok) {
    throw new Error(`Could not load preset settings (${response.status}).`)
  }

  return new Uint8Array(await response.arrayBuffer())
}

async function clearRandomizerStorage(): Promise<void> {
  await Promise.all(['/files', 'cjFS_/files/'].map(deleteDatabase))
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name)
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
    request.onsuccess = () => resolve()
  })
}

async function waitForRandomizedFile(path: string, timeoutMs = 120000): Promise<Blob> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const fileBlob = await window.cjFileBlob?.(path)
    if (fileBlob) {
      return fileBlob
    }

    await new Promise((resolve) => window.setTimeout(resolve, 500))
  }

  throw new Error('Timed out while waiting for the randomized ROM.')
}
