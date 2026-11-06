import { t } from '../i18n/runtime'
import { DEFAULT_MPD_SETTINGS, SQL_DIALECTS } from '../model/mpd'
import type { MpdSettings } from '../model/mpd'
import { isKnownVersion } from '../model/sqlCatalog'

/**
 * Moteur des nouveaux documents, réglé par l'installation : variable
 * VITE_DEFAULT_TARGET, par exemple « postgresql@17 » ou « sqlite ».
 * En conteneur, MERIZ_DEFAULT_TARGET la remplit au démarrage.
 */

/** Réglages lus, ou null si la valeur est vide, inconnue ou mal formée. */
export function parseDefaultTarget(raw: unknown): MpdSettings | null {
  if (typeof raw !== 'string') return null
  const [engine, version, ...rest] = raw.trim().toLowerCase().split('@')
  const dialect = SQL_DIALECTS.find(known => known.id === engine)?.id
  if (!dialect || rest.length) return null
  if (version === undefined) return { dialect, overrides: {} }
  return isKnownVersion(dialect, version) ? { dialect, version, overrides: {} } : null
}

let warned = false
const UNSET = /^\s*$|^__MERIZ_/

/** Réglages MPD d'un nouveau document, ou d'un fichier enregistré sans eux. */
export function instanceMpdSettings(): MpdSettings {
  const raw = import.meta.env.VITE_DEFAULT_TARGET
  // Vide, ou marqueur du build Docker laissé tel quel : le défaut de Meriz, sans message.
  // Une expression régulière, car le minifieur replierait un test sur la chaîne du marqueur,
  // et le conteneur ne pourrait plus la remplacer par une valeur vide.
  if (raw === undefined || UNSET.test(raw)) return DEFAULT_MPD_SETTINGS
  const settings = parseDefaultTarget(raw)
  if (settings) return settings
  if (!warned) { warned = true; console.warn(t('Meriz : VITE_DEFAULT_TARGET invalide ({0}). Moteur par défaut : MySQL.', [raw])) }
  return DEFAULT_MPD_SETTINGS
}
