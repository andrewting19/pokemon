declare global {
  type DsInputButtonType =
    | 'A'
    | 'B'
    | 'SELECT'
    | 'START'
    | 'DPAD_RIGHT'
    | 'DPAD_LEFT'
    | 'DPAD_UP'
    | 'DPAD_DOWN'
    | 'R'
    | 'L'
    | 'X'
    | 'Y'

  interface WebMelonFirmwareLanguage {
    name: string
    id: number
  }

  interface WebMelonConstants {
    DEFAULT_KEYBOARD_BINDINGS: Record<string, number>
    DEFAULT_GAMEPAD_BINDINGS: Record<string, number[]>
    DS_BUTTON_NAME_MAP: Record<DsInputButtonType, string>
    DS_INPUT_MAP: Record<DsInputButtonType, number>
    DS_OUTPUT_AUDIO_SAMPLE_RATE: number
    DS_SCREEN_WIDTH: number
    DS_SCREEN_HEIGHT: number
    DS_SCREEN_SIZE: number
    FIRMWARE_LANGUAGES: WebMelonFirmwareLanguage[]
  }

  interface WebMelonCart {
    createCart: () => void
    loadFileIntoCart: (filename: string) => boolean
    getUnloadedCartName: () => string
    getUnloadedCartCode: () => string
  }

  interface WebMelonStorage {
    createDirectory: (path: string) => void
    mountIndexedDB: (path: string) => void
    initializeFirmwareDirectory?: () => void
    onPrepare: (callback: () => void) => void
    onSaveInitiate: (callback: () => void) => void
    onSaveComplete: (callback: () => void) => void
    prepareVirtualFilesystem: () => void
    sync: () => void
    write: (path: string, data: Uint8Array) => void
  }

  interface WebMelonEmulator {
    hasEmulator: () => boolean
    createEmulator: () => void
    loadFreeBIOS: () => void
    loadUserBIOS: () => void
    loadCart: () => void
    startEmulation: (topScreenElementId: string, bottomScreenElementId: string) => void
    setSavePath: (pathname: string) => void
    getGameTitle: () => string | null
    addShutdownListener: (callback: () => void) => void
    shutdown: () => void
    pause: () => void
    resume: () => void
    setEmulatorSpeed: (multiplier: number) => void
    _eventListeners: {
      mouseDown: EventListener
      mouseMove: EventListener
      mouseUp: EventListener
      touchStart: EventListener
      touchEnd: EventListener
      keyDown: EventListener
      keyUp: EventListener
    }
  }

  interface WebMelonFirmwareSettings {
    nickname: string
    birthdayMonth: number
    birthdayDay: number
    language: number
    shouldFirmwareBoot: boolean
  }

  interface WebMelonFirmwareBiosFileResponse {
    hasBios7: boolean
    hasBios9: boolean
    hasFirmware: boolean
  }

  interface WebMelonFirmware {
    getFirmwareSettings: () => WebMelonFirmwareSettings
    setFirmwareSettings: (settings: WebMelonFirmwareSettings) => WebMelonFirmwareSettings
    uploadBiosFile: (filename: string, biosData: Uint8Array) => void
    getActiveBiosFiles: () => WebMelonFirmwareBiosFileResponse
    canFirmwareBoot: () => boolean
  }

  interface WebMelonInputSettings {
    rumbleEnabled: boolean
    keybinds: Record<string, number>
    alternateKeybinds: string[]
    gamepadAxisSensitivity: number
    gamepadBinds: Record<string, number[]>
    gamepadRumbleIntensity: number
  }

  interface WebMelonInput {
    getInputSettings: () => WebMelonInputSettings
    setInputSettings: (settings: WebMelonInputSettings) => void
    setRumbleEnabled: (enabled: boolean) => void
  }

  interface WebMelonAudio {
    getAudioContext: () => AudioContext
  }

  interface WebMelonAssembly {
    hasWasmSupport: () => boolean
    hasLoaded: () => boolean
    addLoadListener: (callback: () => void) => void
  }

  interface WebMelonInternal {
    emulatorButtonInput: number
    wasmLoaded: boolean
    emulator?: {
      touchScreen: (x: number, y: number) => void
      releaseScreen: () => void
    }
  }

  interface WebMelonInterface {
    cart: WebMelonCart
    constants: WebMelonConstants
    storage: WebMelonStorage
    emulator: WebMelonEmulator
    firmware: WebMelonFirmware
    input: WebMelonInput
    audio: WebMelonAudio
    assembly: WebMelonAssembly
    _internal: WebMelonInternal
  }

  interface Window {
    WebMelon?: WebMelonInterface
    cheerpjInit?: () => Promise<void>
    cheerpjCreateDisplay?: (width: number, height: number, element: Element) => void
    cheerpjRunJar?: (...args: string[]) => void
    cheerpjRunStaticMethod?: (
      thread: unknown,
      className: string,
      methodName: string,
      ...args: unknown[]
    ) => Promise<unknown>
    cheerpjRunMain?: (mainClass: string, classpath: string, ...args: string[]) => Promise<number>
    cheerpOSAddStringFile?: (path: string, data: Uint8Array) => Promise<void>
    cheerpjAddStringFile?: (path: string, data: Uint8Array) => Promise<void>
    cjC?: (className: string) => unknown
    cjNew?: (className: string, ...args: unknown[]) => Promise<unknown>
    cjCall?: (objOrClassName: unknown, methodName: string, ...args: unknown[]) => Promise<unknown>
    cjStringJsToJava?: (value: string) => unknown
    cjFileBlob?: (path: string) => Promise<Blob>
    threads?: unknown[]
    FS?: {
      analyzePath: (path: string) => { exists: boolean }
      readFile: (path: string, opts?: { encoding?: string }) => Uint8Array
      writeFile: (path: string, data: Uint8Array) => void
      unlink: (path: string) => void
      mkdir: (path: string) => void
      mount: (type: unknown, opts: object, path: string) => void
      syncfs: (populate: boolean, callback: (error: unknown) => void) => void
    }
    IDBFS?: unknown
  }
}

export {}
