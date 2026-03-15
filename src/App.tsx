import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEmulator } from './hooks/useEmulator'
import {
  BUNDLED_ROM_NAME,
  fetchBundledRomBuffer,
  formatBytes,
  pressButton,
  releaseButton,
  saveRememberedRom,
  type DsButton,
} from './lib/emulator'
import {
  clearPendingRandomizedRom,
  loadPendingRandomizedRom,
  savePendingRandomizedRom,
  type PendingRandomizedRom,
} from './lib/launchHandoff'
import { randomizeRom } from './lib/randomizer'
import {
  buildCustomSettingsString,
  loadSavedToggles,
  PRESET_TOGGLE_MAP,
  saveToggles,
  type RandomizerToggles,
} from './lib/randomizerSettings'
import {
  deleteSession,
  formatRelativeTime,
  loadSessions,
  migrateRememberedRom,
  type GameSession,
} from './lib/sessions'

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function GameButton({
  button,
  label,
  className,
}: {
  button: DsButton
  label: string
  className: string
}) {
  const begin = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    pressButton(button)
  }
  const end = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    releaseButton(button)
  }

  return (
    <button
      className={className}
      onPointerDown={begin}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={end}
    >
      {label}
    </button>
  )
}

function DpadCluster() {
  const [activeButton, setActiveButton] = useState<DsButton | null>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const currentButtonRef = useRef<DsButton | null>(null)

  const releaseActive = () => {
    if (currentButtonRef.current) {
      releaseButton(currentButtonRef.current)
      currentButtonRef.current = null
    }
    activePointerIdRef.current = null
    setActiveButton(null)
  }

  const resolveDirection = (event: ReactPointerEvent<HTMLDivElement>): DsButton | null => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const dx = x - rect.width / 2
    const dy = y - rect.height / 2
    const deadZone = Math.min(rect.width, rect.height) * 0.12

    if (Math.abs(dx) < deadZone && Math.abs(dy) < deadZone) {
      return currentButtonRef.current
    }

    if (Math.abs(dx) > Math.abs(dy)) {
      return dx >= 0 ? 'DPAD_RIGHT' : 'DPAD_LEFT'
    }

    return dy >= 0 ? 'DPAD_DOWN' : 'DPAD_UP'
  }

  const setDirection = (nextButton: DsButton | null) => {
    if (nextButton === currentButtonRef.current) {
      return
    }

    if (currentButtonRef.current) {
      releaseButton(currentButtonRef.current)
    }

    if (nextButton) {
      pressButton(nextButton)
    }

    currentButtonRef.current = nextButton
    setActiveButton(nextButton)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    activePointerIdRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    setDirection(resolveDirection(event))
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return
    }

    event.preventDefault()
    setDirection(resolveDirection(event))
  }

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return
    }

    event.preventDefault()
    releaseActive()
  }

  useEffect(() => {
    return () => {
      if (currentButtonRef.current) {
        releaseButton(currentButtonRef.current)
      }
    }
  }, [])

  return (
    <div
      className={`dpad-container${activeButton ? ` active-${activeButton.toLowerCase().replace('dpad_', '')}` : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerEnd}
    >
      <div className="dpad-cross" />
      <div className="dpad-center" />
      <div className="dpad-zone up" />
      <div className="dpad-zone down" />
      <div className="dpad-zone left" />
      <div className="dpad-zone right" />
    </div>
  )
}

function ShoulderButton({ button, label }: { button: DsButton; label: string }) {
  const begin = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    pressButton(button)
  }
  const end = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    releaseButton(button)
  }

  return (
    <button
      className="shoulder-btn"
      onPointerDown={begin}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={end}
    >
      {label}
    </button>
  )
}

type PendingBoot =
  | { kind: 'bundled' }
  | { kind: 'prepared'; payload: PendingRandomizedRom }

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return (
    <div className="segment-group">
      {options.map((option) => (
        <button
          key={option.value}
          className={`segment-btn${value === option.value ? ' active' : ''}`}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function SettingsPanel({
  toggles,
  onChange,
  onStart,
  busy,
}: {
  toggles: RandomizerToggles
  onChange: (toggles: RandomizerToggles) => void
  onStart: () => void
  busy: boolean
}) {
  const update = <K extends keyof RandomizerToggles>(key: K, value: RandomizerToggles[K]) => {
    onChange({ ...toggles, [key]: value })
  }

  const applyPreset = (presetId: string) => {
    const preset = PRESET_TOGGLE_MAP[presetId]
    if (preset) {
      onChange({ ...preset })
    }
  }

  return (
    <div className="settings-panel">
      <div className="preset-chip-row">
        {(['nuzlocke', 'balanced', 'chaos'] as const).map((id) => {
          const match = PRESET_TOGGLE_MAP[id]
          const isActive = match && Object.keys(match).every(
            (k) => match[k as keyof RandomizerToggles] === toggles[k as keyof RandomizerToggles],
          )
          return (
            <button
              key={id}
              className={`preset-chip${isActive ? ' active' : ''}`}
              disabled={busy}
              onClick={() => applyPreset(id)}
            >
              {id === 'nuzlocke' ? 'Nuzlocke' : id.charAt(0).toUpperCase() + id.slice(1)}
            </button>
          )
        })}
      </div>

      <div className="settings-group">
        <div className="setting-row">
          <div className="setting-label">Starters</div>
          <SegmentedControl
            value={toggles.starters}
            options={[
              { value: 'fully-random', label: 'Random' },
              { value: 'similar-strength', label: 'Balanced' },
              { value: 'unchanged', label: 'Vanilla' },
            ]}
            onChange={(v) => update('starters', v)}
            disabled={busy}
          />
        </div>

        <div className="setting-row">
          <div className="setting-label">Wild Pokemon</div>
          <SegmentedControl
            value={toggles.wildPokemon}
            options={[
              { value: 'fully-random', label: 'Random' },
              { value: 'random-per-area', label: 'Per Area' },
              { value: 'unchanged', label: 'Vanilla' },
            ]}
            onChange={(v) => update('wildPokemon', v)}
            disabled={busy}
          />
        </div>

        <div className="setting-row">
          <div className="setting-label">Trainers</div>
          <SegmentedControl
            value={toggles.trainers}
            options={[
              { value: 'fully-random', label: 'Random' },
              { value: 'similar-strength', label: 'Balanced' },
              { value: 'unchanged', label: 'Vanilla' },
            ]}
            onChange={(v) => update('trainers', v)}
            disabled={busy}
          />
        </div>

        <div className="setting-row">
          <div className="setting-label">Movesets</div>
          <SegmentedControl
            value={toggles.movesets}
            options={[
              { value: 'unchanged', label: 'Vanilla' },
              { value: 'same-type', label: 'Same Type' },
              { value: 'fully-random', label: 'Random' },
            ]}
            onChange={(v) => update('movesets', v)}
            disabled={busy}
          />
        </div>
      </div>

      <div className="settings-toggle-grid">
        <button
          className={`toggle-pill${toggles.abilities === 'random' ? ' active' : ''}`}
          disabled={busy}
          onClick={() => update('abilities', toggles.abilities === 'random' ? 'unchanged' : 'random')}
        >
          Abilities
        </button>
        <button
          className={`toggle-pill${toggles.fieldItems === 'randomized' ? ' active' : ''}`}
          disabled={busy}
          onClick={() => update('fieldItems', toggles.fieldItems === 'randomized' ? 'unchanged' : 'randomized')}
        >
          Field Items
        </button>
        <button
          className={`toggle-pill${toggles.randomizeMoveTyping ? ' active' : ''}`}
          disabled={busy}
          onClick={() => update('randomizeMoveTyping', !toggles.randomizeMoveTyping)}
        >
          Move Typing
        </button>
        <button
          className={`toggle-pill${toggles.catchRateBoost ? ' active' : ''}`}
          disabled={busy}
          onClick={() => update('catchRateBoost', !toggles.catchRateBoost)}
        >
          Catch Boost
        </button>
      </div>

      <button className="settings-start-btn" disabled={busy} onClick={onStart}>
        Start Custom Run
      </button>
    </div>
  )
}

function LauncherScreen({
  status,
  error,
  busy,
  romDownloadProgress,
  toggles,
  onToggleChange,
  sessions,
  onContinueSession,
  onDeleteSession,
  onVanilla,
  onCustomStart,
  onImportRom,
  initialSettingsOpen = false,
}: {
  status: string
  error: string | null
  busy: boolean
  romDownloadProgress: number | null
  toggles: RandomizerToggles
  onToggleChange: (toggles: RandomizerToggles) => void
  sessions: GameSession[]
  onContinueSession: (session: GameSession) => void
  onDeleteSession: (session: GameSession) => void
  onVanilla: () => void
  onCustomStart: () => void
  onImportRom: (file: File) => void
  initialSettingsOpen?: boolean
}) {
  const romInputRef = useRef<HTMLInputElement | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(initialSettingsOpen)

  return (
    <main className="dsi-shell launcher-mode">
      <div className="top-shell">
        <div className="shoulder-bar">
          <div className="shoulder-btn decorative">L</div>
          <div className="shoulder-btn decorative">R</div>
        </div>
        <div className="screen-bezel top-bezel">
          <div className="launcher-top-screen">
            <div className="launcher-top-title">Platinum Web</div>
            <div className="launcher-top-sub">Pokemon Platinum in your browser</div>
            {romDownloadProgress !== null ? (
              <div className="download-progress">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${romDownloadProgress}%` }} />
                </div>
                <div className="progress-label">Downloading... {romDownloadProgress}%</div>
              </div>
            ) : null}
            <div className="launcher-top-status">{status}</div>
            {error ? <div className="error-toast launcher-error">{error}</div> : null}
          </div>
        </div>
      </div>

      <div className="hinge">
        <div className={busy ? 'status-led loading' : 'status-led live'} />
      </div>

      <div className="bottom-shell">
        <div className="dpad-section">
          <div className="dpad-container decorative">
            <div className="dpad-cross" />
            <div className="dpad-center" />
          </div>
        </div>

        <div className="bottom-screen-wrapper">
          <div className="screen-bezel bottom-bezel">
            <div className="launcher-bottom-screen">
              {sessions.length > 0 ? (
                <div className="session-list">
                  {sessions.map((session) => (
                    <div key={session.id} className="session-card">
                      <div className="session-card-header">
                        <div className="session-card-name">{session.name}</div>
                        <div className="session-card-time">{formatRelativeTime(session.lastPlayedAt)}</div>
                      </div>
                      <div className="session-card-meta">{session.sourceLabel}</div>
                      <div className="session-card-actions">
                        <button className="session-card-btn primary" disabled={busy} onClick={() => onContinueSession(session)}>
                          Continue
                        </button>
                        <button className="session-card-btn danger" disabled={busy} onClick={() => onDeleteSession(session)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="launcher-divider">Start New</div>
                </div>
              ) : null}

              <div className="launcher-actions">
                <button className="welcome-btn" disabled={busy} onClick={onVanilla}>
                  Play Vanilla
                </button>
                <button
                  className="welcome-btn ghost"
                  disabled={busy}
                  onClick={() => setSettingsOpen(!settingsOpen)}
                >
                  {settingsOpen ? 'Hide Settings' : 'Randomize & Play'}
                </button>
                {settingsOpen ? (
                  <SettingsPanel
                    toggles={toggles}
                    onChange={onToggleChange}
                    onStart={onCustomStart}
                    busy={busy}
                  />
                ) : null}
                <button
                  className="welcome-btn subtle"
                  disabled={busy}
                  onClick={() => romInputRef.current?.click()}
                >
                  Import Your Own ROM
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="face-section">
          <div className="face-container decorative">
            <div className="face-btn x-btn">X</div>
            <div className="face-btn y-btn">Y</div>
            <div className="face-btn a-btn">A</div>
            <div className="face-btn b-btn">B</div>
          </div>
        </div>

        <div className="utility-row">
          <div className="pill-btn decorative">Select</div>
          <div className="pill-btn decorative">Start</div>
        </div>
      </div>

      <input
        ref={romInputRef}
        className="hidden-input"
        type="file"
        accept=".nds"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            onImportRom(file)
          }
          event.currentTarget.value = ''
        }}
      />
    </main>
  )
}

function EmulatorShell({
  initialBoot,
  onPreparedBootConsumed,
  onReturnToLauncher,
}: {
  initialBoot: PendingBoot | null
  onPreparedBootConsumed: () => void
  onReturnToLauncher: () => void
}) {
  const romInputRef = useRef<HTMLInputElement | null>(null)
  const saveInputRef = useRef<HTMLInputElement | null>(null)
  const autoBootRef = useRef(false)
  const preparedBootClearedRef = useRef(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [controlScale, setControlScale] = useState(() => {
    const saved = window.localStorage.getItem('pokemon:control-scale')
    return saved ? Number(saved) : 1
  })
  const [controlOpacity, setControlOpacity] = useState(() => {
    const saved = window.localStorage.getItem('pokemon:control-opacity')
    return saved ? Number(saved) : 0.92
  })

  const {
    sdkReady,
    storageReady,
    running,
    launching,
    paused,
    fastForward,
    status,
    error,
    saveBanner,
    session,
    romDownloadProgress,
    start,
    stop,
    togglePause,
    toggleFastForward,
    exportSave,
    importSave,
    startBundledRom,
    startPreparedRom,
  } = useEmulator({ disableAutoResume: Boolean(initialBoot) })

  useEffect(() => {
    window.localStorage.setItem('pokemon:control-scale', String(controlScale))
  }, [controlScale])

  useEffect(() => {
    window.localStorage.setItem('pokemon:control-opacity', String(controlOpacity))
  }, [controlOpacity])

  useEffect(() => {
    if (!initialBoot || autoBootRef.current || !sdkReady || !storageReady || launching) {
      return
    }

    autoBootRef.current = true

    if (initialBoot.kind === 'bundled') {
      void startBundledRom()
      return
    }

    void startPreparedRom(
      initialBoot.payload.fileName,
      initialBoot.payload.fileData,
      initialBoot.payload.sourceLabel,
    )
  }, [initialBoot, launching, sdkReady, startBundledRom, startPreparedRom, storageReady])

  useEffect(() => {
    if (!running || preparedBootClearedRef.current || initialBoot?.kind !== 'prepared') {
      return
    }

    preparedBootClearedRef.current = true
    onPreparedBootConsumed()
  }, [initialBoot, onPreparedBootConsumed, running])

  const ledClass = useMemo(() => {
    if (error) return 'status-led error'
    if (running) return 'status-led live'
    if (!sdkReady || !storageReady) return 'status-led loading'
    return 'status-led'
  }, [error, running, sdkReady, storageReady])

  const showSaveBanner = saveBanner !== 'No save activity yet.' && saveBanner !== 'Save storage is idle.'

  return (
    <main
      className="dsi-shell"
      style={
        {
          '--control-scale': controlScale,
          '--control-opacity': controlOpacity,
        } as CSSProperties
      }
    >
      <div className="top-shell">
        <div className="shoulder-bar">
          <ShoulderButton button="L" label="L" />
          <ShoulderButton button="R" label="R" />
        </div>
        <div className="screen-bezel top-bezel">
          {!running ? (
            <div className="welcome-overlay">
              <div className="welcome-title">Platinum Web</div>
              <div className="welcome-sub">Nintendo DS in your browser</div>
              {romDownloadProgress !== null ? (
                <div className="download-progress">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${romDownloadProgress}%` }} />
                  </div>
                  <div className="progress-label">Downloading... {romDownloadProgress}%</div>
                </div>
              ) : (
                <>
                  <div className="welcome-sub">{status}</div>
                  {sdkReady && storageReady && !launching ? (
                    <div className="welcome-actions">
                      <button className="welcome-btn" onClick={onReturnToLauncher}>
                        Back to Menu
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
          <canvas id="top-screen" width="256" height="192" />
        </div>
      </div>

      <div className="hinge">
        <div className={ledClass} />
      </div>

      <div className="bottom-shell">
        <div className="dpad-section">
          <DpadCluster />
        </div>

        <div className="bottom-screen-wrapper">
          <div className="screen-bezel bottom-bezel">
            <canvas id="bottom-screen" width="256" height="192" />
          </div>
        </div>

        <div className="face-section">
          <div className="face-container">
            <GameButton button="X" label="X" className="face-btn x-btn" />
            <GameButton button="Y" label="Y" className="face-btn y-btn" />
            <GameButton button="A" label="A" className="face-btn a-btn" />
            <GameButton button="B" label="B" className="face-btn b-btn" />
          </div>
        </div>

        <div className="utility-row">
          <GameButton button="SELECT" label="Select" className="pill-btn" />
          <GameButton button="START" label="Start" className="pill-btn" />
        </div>

        <div className="status-bar">
          <span className="status-text">{status}</span>
        </div>
      </div>

      <button
        className={`menu-toggle ${drawerOpen ? 'open' : ''}`}
        onClick={() => setDrawerOpen(!drawerOpen)}
      >
        <GearIcon />
      </button>

      <div
        className={`drawer-backdrop ${drawerOpen ? 'visible' : ''}`}
        onClick={() => setDrawerOpen(false)}
      />

      <div className={`drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="drawer-handle" />

        {session ? (
          <div className="drawer-section">
            <div className="drawer-label">Now Playing</div>
            <div className="session-info">
              <div className="session-info-row">
                <span>Title</span>
                <span>{session.gameTitle}</span>
              </div>
              <div className="session-info-row">
                <span>File</span>
                <span>{session.fileName}</span>
              </div>
              <div className="session-info-row">
                <span>Size</span>
                <span>{formatBytes(session.fileSize)}</span>
              </div>
              <div className="session-info-row">
                <span>Mode</span>
                <span>{session.sourceLabel}</span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="drawer-section">
          <div className="drawer-label">Playback</div>
          <div className="playback-row">
            <button
              className={`playback-btn ${paused ? 'active' : ''}`}
              disabled={!running}
              onClick={() => togglePause()}
            >
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button
              className={`playback-btn ${fastForward ? 'active' : ''}`}
              disabled={!running}
              onClick={() => toggleFastForward()}
            >
              {fastForward ? '1x' : '2x'}
            </button>
            <button className="playback-btn" disabled={!running} onClick={() => stop()}>
              Stop
            </button>
          </div>
        </div>

        <div className="drawer-section">
          <div className="drawer-label">Session</div>
          <div className="drawer-actions">
            <button
              className="drawer-btn"
              onClick={() => {
                if (!running || window.confirm('This will end your current session. Make sure you have saved in-game first.')) {
                  onReturnToLauncher()
                }
              }}
            >
              Back to Menu
            </button>
          </div>
        </div>

        <div className="drawer-section">
          <div className="drawer-label">Save Data</div>
          <div className="drawer-actions">
            <button className="drawer-btn" disabled={!session} onClick={() => exportSave()}>
              Export Save
            </button>
            <button className="drawer-btn" disabled={!session} onClick={() => saveInputRef.current?.click()}>
              Import Save
            </button>
          </div>
        </div>

        <div className="drawer-section">
          <div className="drawer-label">Controls</div>
          <div className="slider-row">
            <span className="slider-label">Scale</span>
            <input
              className="slider-input"
              type="range"
              min="0.82"
              max="1.28"
              step="0.01"
              value={controlScale}
              onChange={(e) => setControlScale(Number(e.target.value))}
            />
          </div>
          <div className="slider-row">
            <span className="slider-label">Opacity</span>
            <input
              className="slider-input"
              type="range"
              min="0.55"
              max="1"
              step="0.01"
              value={controlOpacity}
              onChange={(e) => setControlOpacity(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="drawer-section">
          <div className="drawer-label">Keyboard</div>
          <div className="session-info">
            <div className="session-info-row"><span>D-pad</span><span>Arrows / WASD</span></div>
            <div className="session-info-row"><span>A / B</span><span>J / K</span></div>
            <div className="session-info-row"><span>X / Y</span><span>I / U</span></div>
            <div className="session-info-row"><span>L / R</span><span>Q / E</span></div>
            <div className="session-info-row"><span>Start</span><span>Enter</span></div>
            <div className="session-info-row"><span>Select</span><span>Shift</span></div>
          </div>
        </div>
      </div>

      <div className={`save-toast ${showSaveBanner ? 'visible' : ''}`}>
        {saveBanner}
      </div>

      {error ? <div className="error-toast">{error}</div> : null}

      <input
        ref={romInputRef}
        className="hidden-input"
        type="file"
        accept=".nds"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void start(file)
          event.currentTarget.value = ''
        }}
      />
      <input
        ref={saveInputRef}
        className="hidden-input"
        type="file"
        accept=".sav"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void importSave(file)
          event.currentTarget.value = ''
        }}
      />
    </main>
  )
}

function App() {
  const [mode, setMode] = useState<'checking' | 'launcher' | 'randomizing' | 'emulator'>('checking')
  const [pendingBoot, setPendingBoot] = useState<PendingBoot | null>(null)
  const [status, setStatus] = useState('Checking for a pending randomized run...')
  const [error, setError] = useState<string | null>(null)
  const [romDownloadProgress, setRomDownloadProgress] = useState<number | null>(null)
  const [randomizerToggles, setRandomizerToggles] = useState<RandomizerToggles>(loadSavedToggles)
  const [initialSettingsOpen, setInitialSettingsOpen] = useState(false)
  const [sessions, setSessions] = useState<GameSession[]>([])

  const refreshSessions = () => {
    setSessions(loadSessions())
  }

  const handleContinueSession = (session: GameSession) => {
    saveRememberedRom({ fileName: session.fileName, fileSize: session.fileSize, romPath: session.romPath })
    setPendingBoot(null)
    setMode('emulator')
  }

  const handleDeleteSession = async (session: GameSession) => {
    deleteSession(session.id)
    refreshSessions()
  }

  const returnToLauncher = () => {
    setInitialSettingsOpen(true)
    refreshSessions()
    setMode('launcher')
    setStatus('Choose a play mode.')
    setError(null)
  }

  const handleToggleChange = (toggles: RandomizerToggles) => {
    setRandomizerToggles(toggles)
    saveToggles(toggles)
  }

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const pendingRandomizedRom = await loadPendingRandomizedRom()
        if (cancelled) {
          return
        }

        if (pendingRandomizedRom) {
          setPendingBoot({ kind: 'prepared', payload: pendingRandomizedRom })
          setStatus('Restarted into a clean emulator session.')
          setMode('emulator')
          return
        }

        migrateRememberedRom()
        refreshSessions()
        setStatus('Choose a play mode.')
        setMode('launcher')
      } catch (caught) {
        if (cancelled) {
          return
        }

        const message = caught instanceof Error ? caught.message : 'Could not restore the pending launch state.'
        setError(message)
        setStatus('Pending run recovery failed. You can still start a new session.')
        setMode('launcher')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])


  const startVanillaLaunch = () => {
    setPendingBoot({ kind: 'bundled' })
    setMode('emulator')
  }

  const startImportedLaunch = async (file: File) => {
    try {
      setError(null)
      setStatus('Preparing imported ROM...')
      const fileData = new Uint8Array(await file.arrayBuffer())
      setPendingBoot({
        kind: 'prepared',
        payload: {
          fileName: file.name,
          sourceLabel: 'Imported ROM',
          fileData,
        },
      })
      setMode('emulator')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Imported ROM startup failed.'
      setError(message)
      setStatus('The imported ROM could not be prepared.')
      setMode('launcher')
    }
  }

  const startCustomRandomizedLaunch = async () => {
    setMode('randomizing')
    setError(null)

    try {
      const baseRom = await fetchBundledRomBuffer({
        onProgress: setRomDownloadProgress,
        onStatus: setStatus,
      })
      setStatus('Building custom randomizer settings...')
      const customSettings = await buildCustomSettingsString(randomizerToggles)

      setStatus('Initializing the Pokemon randomizer...')
      const randomized = await randomizeRom({
        romData: baseRom,
        romName: BUNDLED_ROM_NAME,
        preset: 'balanced',
        presetLabel: 'Custom Randomizer',
        settingsOverride: customSettings,
        onStatus: setStatus,
      })

      setStatus('Saving the randomized ROM for handoff...')
      await savePendingRandomizedRom({
        fileName: randomized.fileName,
        sourceLabel: randomized.presetLabel,
        fileData: randomized.fileData,
      })

      setStatus('Restarting into a clean emulator session...')
      window.location.reload()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Custom randomizer startup failed.'
      const debugRaw = window.localStorage.getItem('pokemon:randomizer-debug')
      let failedStep = ''
      if (debugRaw) {
        try {
          const debug = JSON.parse(debugRaw) as { currentStep?: string; error?: string }
          failedStep = debug.currentStep ? ` [step: ${debug.currentStep}]` : ''
        } catch { /* ignore */ }
      }
      setError(`${message}${failedStep}`)
      setStatus('The custom randomized run could not be prepared.')
      setRomDownloadProgress(null)
      setMode('launcher')
    }
  }

  const handlePreparedBootConsumed = () => {
    if (pendingBoot?.kind !== 'prepared') {
      return
    }

    void clearPendingRandomizedRom()
    setPendingBoot(null)
  }

  if (mode !== 'emulator') {
    return (
      <LauncherScreen
        status={status}
        error={error}
        busy={mode === 'checking' || mode === 'randomizing'}
        romDownloadProgress={romDownloadProgress}
        toggles={randomizerToggles}
        onToggleChange={handleToggleChange}
        sessions={sessions}
        onContinueSession={handleContinueSession}
        onDeleteSession={(s) => void handleDeleteSession(s)}
        onVanilla={startVanillaLaunch}
        onCustomStart={() => void startCustomRandomizedLaunch()}
        onImportRom={(file) => void startImportedLaunch(file)}
        initialSettingsOpen={initialSettingsOpen}
      />
    )
  }

  return (
    <EmulatorShell
      initialBoot={pendingBoot}
      onPreparedBootConsumed={handlePreparedBootConsumed}
      onReturnToLauncher={returnToLauncher}
    />
  )
}

export default App
