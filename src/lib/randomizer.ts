const CHEERPJ_LOADER_URL = 'https://cjrtnc.leaningtech.com/2.2/loader.js'
const RANDOMIZER_FILES_DB = 'cjFS_/files/'

export type RandomizerPresetId = 'classic' | 'balanced' | 'chaos'

export interface RandomizerPreset {
  id: RandomizerPresetId
  label: string
  description: string
  settingsString: string
}

export const RANDOMIZER_PRESETS: RandomizerPreset[] = [
  {
    id: 'classic',
    label: 'Classic Randomizer',
    description: 'Random starters, wilds, trainers, and statics without the full chaos stack.',
    settingsString: 'juAfEB9AEEACQeJAICFAAAFABABAABAAAAAAAAAgAyE1Bva2Vtb24gQmxhY2sgMiAoVSkAJmjy61/f0Q==',
  },
  {
    id: 'balanced',
    label: 'Balanced Randomizer',
    description: 'A steadier preset with more guardrails than classic while still reshuffling the run.',
    settingsString: 'juAfEB9AEiAMceJAICFAAAFAACBAABAAAAAAAAAgAyE1Bva2Vtb24gQmxhY2sgMiAoVSl5RaLE61/f0Q==',
  },
  {
    id: 'chaos',
    label: 'Chaos Randomizer',
    description: 'The loud upstream race preset with far less balance protection.',
    settingsString: 'LuAfEB9AERAIYeJBoECQAACQA9CR8iAAAAAAAAGpgyE1Bva2Vtb24gQmxhY2sgMiAoVSno8Yr261/f0Q==',
  },
]

function getRandomizerJarUrl(): string {
  return new URL('/randomizer/randomizer.jar', window.location.href).toString()
}

declare global {
  interface Window {
    cheerpjInit?: () => Promise<void>
    cheerpjCreateDisplay?: (width: number, height: number, element?: Element) => Promise<void> | void
    cheerpjRunJar?: (path: string, ...args: string[]) => Promise<void> | void
    cheerpjAddStringFile?: (path: string, data: Uint8Array) => void
    cjNew?: (className: string, ...args: unknown[]) => Promise<unknown>
    cjCall?: (instance: unknown, methodName: string, ...args: unknown[]) => Promise<unknown>
    cjStringJsToJava?: (value: string) => unknown
    cheerpjRunStaticMethod?: (thread: unknown, className: string, signature: string, ...args: unknown[]) => Promise<unknown>
    threads?: unknown[]
  }
}

interface RandomizerFileRecord {
  type?: string
  inodeId?: number
  contents?: ArrayBuffer | Uint8Array
}

interface RandomizerDirectoryRecord {
  contents?: string[]
}

let loaderPromise: Promise<void> | null = null
let runtimePromise: Promise<void> | null = null

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
  const presetConfig = RANDOMIZER_PRESETS.find((option) => option.id === preset)
  if (!presetConfig) {
    throw new Error('Unknown randomizer preset.')
  }

  onStatus?.('Preparing the browser randomizer...')
  await ensureRuntimeReady()
  await clearRandomizerFiles()

  if (!window.cheerpjAddStringFile || !window.cjNew || !window.cjCall || !window.cjStringJsToJava) {
    throw new Error('The browser randomizer API did not initialize correctly.')
  }

  const sourceFileName = buildSourceFileName(romName, preset)
  const outputFileName = buildOutputFileName(romName, preset)
  const sourcePath = `/str/${sourceFileName}`
  const outputPath = `/files/${outputFileName}`

  window.cheerpjAddStringFile(sourcePath, romData)

  onStatus?.(`Applying ${presetConfig.label}...`)
  const javaSettings = await loadJavaSettings(presetConfig.settingsString)
  const javaRandom = await window.cjNew('java.util.Random')
  const romHandler = await window.cjNew('com.dabomstew.pkrandom.romhandlers.Gen4RomHandler', javaRandom)
  await window.cjCall(romHandler, 'loadRom', window.cjStringJsToJava(sourcePath))

  await window.cjCall(javaSettings, 'tweakForRom', romHandler)
  const randomizer = await window.cjNew('com.dabomstew.pkrandom.Randomizer', javaSettings, romHandler)

  onStatus?.('Generating a fresh randomized Platinum ROM...')
  await window.cjCall(randomizer, 'v11', window.cjStringJsToJava(outputPath))

  const fileData = await waitForRandomizedFile(outputFileName)

  return {
    fileName: outputFileName,
    fileData,
    presetLabel: presetConfig.label,
  }
}

function buildSourceFileName(romName: string, preset: RandomizerPresetId): string {
  return `${romName.replace(/\.nds$/i, '')}-${preset}-source.nds`
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
  })()

  return runtimePromise
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

async function loadJavaSettings(settingsString: string): Promise<unknown> {
  if (window.cheerpjRunStaticMethod && window.threads?.[0] && window.cjStringJsToJava) {
    return window.cheerpjRunStaticMethod(
      window.threads[0],
      'com/dabomstew/pkrandom/Settings',
      'fromString(Ljava/lang/String;)Lcom/dabomstew/pkrandom/Settings;',
      window.cjStringJsToJava(settingsString),
    )
  }

  if (window.cjCall && window.cjStringJsToJava) {
    return window.cjCall(
      'com.dabomstew.pkrandom.Settings',
      'fromString',
      window.cjStringJsToJava(settingsString),
    )
  }

  throw new Error('The browser randomizer runtime could not decode preset settings.')
}

async function clearRandomizerFiles(): Promise<void> {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(RANDOMIZER_FILES_DB)
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
    request.onsuccess = () => resolve()
  })
}

function openCheerpjFilesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RANDOMIZER_FILES_DB, 1)
    request.onerror = () => reject(request.error ?? new Error('Could not open the randomizer file cache.'))
    request.onsuccess = () => resolve(request.result)
  })
}

async function waitForRandomizedFile(fileName: string, timeoutMs = 120000): Promise<Uint8Array> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const bytes = await readCheerpjFile(fileName)
    if (bytes) {
      return bytes
    }

    await new Promise((resolve) => window.setTimeout(resolve, 500))
  }

  throw new Error('Timed out while waiting for the randomized ROM.')
}

async function readCheerpjFile(fileName: string): Promise<Uint8Array | null> {
  const db = await openCheerpjFilesDb()

  try {
    const records = await new Promise<Array<RandomizerFileRecord | RandomizerDirectoryRecord>>((resolve, reject) => {
      const request = db.transaction('files', 'readonly').objectStore('files').getAll()
      request.onerror = () => reject(request.error ?? new Error('Could not read the randomizer output cache.'))
      request.onsuccess = () => resolve(request.result as Array<RandomizerFileRecord | RandomizerDirectoryRecord>)
    })

    const rootDirectory = records.find(
      (entry) => (entry as RandomizerFileRecord)?.type === 'dir' && Array.isArray((entry as RandomizerDirectoryRecord).contents),
    ) as RandomizerDirectoryRecord | undefined
    if (!rootDirectory?.contents) {
      return null
    }

    const inodeToName = new Map<number, string>(
      rootDirectory.contents.map((entry, index) => [index + 2, entry.replace(/^\//, '')]),
    )

    const fileRecord = records.find(
      (entry) =>
        (entry as RandomizerFileRecord)?.type === 'file' &&
        inodeToName.get((entry as RandomizerFileRecord).inodeId ?? -1) === fileName,
    ) as RandomizerFileRecord | undefined

    if (!fileRecord?.contents) {
      return null
    }

    return fileRecord.contents instanceof Uint8Array ? fileRecord.contents : new Uint8Array(fileRecord.contents)
  } finally {
    db.close()
  }
}
