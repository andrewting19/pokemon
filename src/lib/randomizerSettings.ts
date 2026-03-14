import {
  crc32,
  decodePresetSettings,
  loadPresetSettings,
  readFullIntBigEndian,
  updateSettingsString,
  writeFullIntBigEndian,
} from './randomizer'

export interface RandomizerToggles {
  starters: 'fully-random' | 'similar-strength' | 'unchanged'
  wildPokemon: 'fully-random' | 'random-per-area' | 'unchanged'
  trainers: 'fully-random' | 'similar-strength' | 'unchanged'
  movesets: 'unchanged' | 'same-type' | 'fully-random'
  abilities: 'random' | 'unchanged'
  fieldItems: 'randomized' | 'unchanged'
  randomizeMoveTyping: boolean
  catchRateBoost: boolean
}

export const DEFAULT_TOGGLES: RandomizerToggles = {
  starters: 'fully-random',
  wildPokemon: 'fully-random',
  trainers: 'fully-random',
  movesets: 'unchanged',
  abilities: 'random',
  fieldItems: 'randomized',
  randomizeMoveTyping: false,
  catchRateBoost: true,
}

export const PRESET_TOGGLE_MAP: Record<string, RandomizerToggles> = {
  nuzlocke: { ...DEFAULT_TOGGLES },
  balanced: {
    starters: 'similar-strength',
    wildPokemon: 'fully-random',
    trainers: 'fully-random',
    movesets: 'same-type',
    abilities: 'unchanged',
    fieldItems: 'unchanged',
    randomizeMoveTyping: false,
    catchRateBoost: false,
  },
  chaos: {
    starters: 'fully-random',
    wildPokemon: 'fully-random',
    trainers: 'fully-random',
    movesets: 'fully-random',
    abilities: 'random',
    fieldItems: 'randomized',
    randomizeMoveTyping: true,
    catchRateBoost: false,
  },
}

// UPR ZX v322 byte layout — bit positions within each settings byte.
// Reference: Settings.java toString() / makeByteSelected().
// Byte 4 (starters): bit0=CUSTOM, bit1=COMPLETELY_RANDOM, bit2=UNCHANGED, bit3=RANDOM_WITH_TWO_EVOS
// Byte 15 (wilds): bit1=AREA_MAPPING, bit2=restriction NONE, bit5=RANDOM, bit6=UNCHANGED
// Byte 13 (trainers): bit0=UNCHANGED, bit1=RANDOM, bit2=DISTRIBUTED, ...
// Byte 11 (movesets): bit0=COMPLETELY_RANDOM, bit1=RANDOM_PREFER_SAME_TYPE, bit2=UNCHANGED
// Byte 3 (abilities): bit0=UNCHANGED, bit1=RANDOMIZE
// Byte 24 (field items): bit0=RANDOM, bit1=SHUFFLE, bit2=UNCHANGED, bit3=banBadItems, bit4=RANDOM_EVEN
// Byte 25 (move data): bit0=powers, bit1=accuracies, bit2=PPs, bit3=types, bit4=category
// Byte 26 (evolutions): bit0=UNCHANGED, bit1=RANDOM
// Byte 50 (catch rate): bits 3-5 = minimumCatchRateLevel
// Bytes 32-35 (misc tweaks): uint32 bitmask

const STARTERS_BYTE = 4
const ABILITIES_BYTE = 3
const MOVESETS_BYTE = 11
const TRAINERS_BYTE = 13
const TRAINER_MISC_BYTE = 27
const WILDS_BYTE = 15
const WILDS2_BYTE = 16
const FIELD_ITEMS_BYTE = 24
const MOVE_DATA_BYTE = 25
const MISC_TWEAKS_OFFSET = 32
const CATCH_RATE_BYTE = 50

// Misc tweak bits (from MiscTweak.java)
const TWEAK_FASTEST_TEXT = 1 << 3
const TWEAK_RUNNING_SHOES_INDOORS = 1 << 4
const TWEAK_NATIONAL_DEX_AT_START = 1 << 7
const TWEAK_FAST_DISTORTION_WORLD = 1 << 20
const QOL_TWEAKS = TWEAK_FASTEST_TEXT | TWEAK_RUNNING_SHOES_INDOORS | TWEAK_NATIONAL_DEX_AT_START | TWEAK_FAST_DISTORTION_WORLD

export async function buildCustomSettingsString(toggles: RandomizerToggles): Promise<string> {
  const settingsBytes = await loadPresetSettings('randomizer/settings/balanced.rnqs')
  const decoded = decodePresetSettings(settingsBytes)
  const base64 = updateSettingsString(decoded.version, decoded.settingsString)
  return applyTogglesToSettings(base64, toggles)
}

export function applyTogglesToSettings(base64Settings: string, toggles: RandomizerToggles): string {
  const raw = Uint8Array.from(atob(base64Settings), (c) => c.charCodeAt(0))
  const data = new Uint8Array(raw.length)
  data.set(raw)

  // The migrated base64 includes settings bytes + ROM name + 8-byte checksum trailer.
  // CRC32 covers everything except the last 8 bytes.
  const dataLength = data.length

  // Starters (byte 4): clear mode bits 0-3, set desired mode, preserve sub-flags in bits 4-7
  const starterSubFlags = data[STARTERS_BYTE] & 0xf0
  switch (toggles.starters) {
    case 'fully-random':
      data[STARTERS_BYTE] = starterSubFlags | 0x02 // bit 1 = COMPLETELY_RANDOM
      break
    case 'similar-strength':
      data[STARTERS_BYTE] = starterSubFlags | 0x08 // bit 3 = RANDOM_WITH_TWO_EVOLUTIONS
      break
    case 'unchanged':
      data[STARTERS_BYTE] = starterSubFlags | 0x04 // bit 2 = UNCHANGED
      break
  }

  // Wild Pokemon (byte 15): clear mode bits 1,4,5,6; set desired mode; preserve bits 0,2,3,7
  const wildSubFlags = data[WILDS_BYTE] & 0x8d // preserve bits 0,2,3,7
  switch (toggles.wildPokemon) {
    case 'fully-random':
      data[WILDS_BYTE] = wildSubFlags | 0x20 // bit 5 = RANDOM
      break
    case 'random-per-area':
      data[WILDS_BYTE] = wildSubFlags | 0x02 // bit 1 = AREA_MAPPING
      break
    case 'unchanged':
      data[WILDS_BYTE] = wildSubFlags | 0x40 // bit 6 = UNCHANGED
      break
  }

  // Trainers (byte 13): clear mode bits 0-5, set desired mode, preserve bits 6-7
  const trainerSubFlags = data[TRAINERS_BYTE] & 0xc0
  switch (toggles.trainers) {
    case 'fully-random':
      data[TRAINERS_BYTE] = trainerSubFlags | 0x02 // bit 1 = RANDOM
      break
    case 'similar-strength':
      data[TRAINERS_BYTE] = trainerSubFlags | 0x02 // bit 1 = RANDOM (strength handled in byte 27)
      data[TRAINER_MISC_BYTE] |= 0x01 // bit 0 = trainersUsePokemonOfSimilarStrength
      break
    case 'unchanged':
      data[TRAINERS_BYTE] = trainerSubFlags | 0x01 // bit 0 = UNCHANGED
      break
  }
  if (toggles.trainers !== 'similar-strength') {
    data[TRAINER_MISC_BYTE] &= ~0x01 // clear similar-strength flag
  }

  // Movesets (byte 11): clear mode bits 0-3, set desired mode, preserve bits 4-7
  const movesetSubFlags = data[MOVESETS_BYTE] & 0xf0
  switch (toggles.movesets) {
    case 'unchanged':
      data[MOVESETS_BYTE] = movesetSubFlags | 0x04 // bit 2 = UNCHANGED
      break
    case 'same-type':
      data[MOVESETS_BYTE] = movesetSubFlags | 0x02 // bit 1 = RANDOM_PREFER_SAME_TYPE
      break
    case 'fully-random':
      data[MOVESETS_BYTE] = movesetSubFlags | 0x01 // bit 0 = COMPLETELY_RANDOM
      break
  }

  // Abilities (byte 3): clear mode bits 0-1, set desired mode, preserve sub-flags in bits 2-7
  const abilitySubFlags = data[ABILITIES_BYTE] & 0xfc
  switch (toggles.abilities) {
    case 'unchanged':
      data[ABILITIES_BYTE] = abilitySubFlags | 0x01 // bit 0 = UNCHANGED
      break
    case 'random':
      data[ABILITIES_BYTE] = abilitySubFlags | 0x02 // bit 1 = RANDOMIZE
      break
  }

  // Field items (byte 24): clear mode bits 0-2,4; set desired mode, preserve bit 3 (banBadItems)
  const fieldItemSubFlags = data[FIELD_ITEMS_BYTE] & 0xe8 // preserve bits 3,5,6,7
  switch (toggles.fieldItems) {
    case 'unchanged':
      data[FIELD_ITEMS_BYTE] = fieldItemSubFlags | 0x04 // bit 2 = UNCHANGED
      break
    case 'randomized':
      data[FIELD_ITEMS_BYTE] = fieldItemSubFlags | 0x09 // bit 0 = RANDOM + bit 3 = banBadItems
      break
  }

  // Move typing (byte 25): bit 3 = randomizeMoveTypes
  if (toggles.randomizeMoveTyping) {
    data[MOVE_DATA_BYTE] |= 0x08
  } else {
    data[MOVE_DATA_BYTE] &= ~0x08
  }

  // Catch rate boost (byte 16 bit 0 + byte 50 bits 3-5)
  if (toggles.catchRateBoost) {
    data[WILDS2_BYTE] |= 0x01 // bit 0 = useMinimumCatchRate
    data[CATCH_RATE_BYTE] = (data[CATCH_RATE_BYTE] & ~0x38) | (1 << 3) // level 2 (value 1 << 3)
  } else {
    data[WILDS2_BYTE] &= ~0x01
    data[CATCH_RATE_BYTE] &= ~0x38
  }

  // Force QoL misc tweaks ON
  const currentTweaks = readFullIntBigEndian(data, MISC_TWEAKS_OFFSET)
  writeFullIntBigEndian(data, MISC_TWEAKS_OFFSET, currentTweaks | QOL_TWEAKS)

  // Recompute CRC32 checksum (covers bytes 0 through dataLength-9)
  const checksum = crc32(data.subarray(0, dataLength - 8))
  writeFullIntBigEndian(data, dataLength - 8, checksum)

  return btoa(String.fromCharCode(...data))
}

export function loadSavedToggles(): RandomizerToggles {
  const raw = window.localStorage.getItem('pokemon:randomizer-toggles')
  if (!raw) {
    return { ...DEFAULT_TOGGLES }
  }

  try {
    const parsed = JSON.parse(raw) as Partial<RandomizerToggles>
    return { ...DEFAULT_TOGGLES, ...parsed }
  } catch {
    return { ...DEFAULT_TOGGLES }
  }
}

export function saveToggles(toggles: RandomizerToggles): void {
  window.localStorage.setItem('pokemon:randomizer-toggles', JSON.stringify(toggles))
}
