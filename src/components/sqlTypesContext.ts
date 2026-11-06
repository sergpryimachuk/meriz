import { createContext, useContext } from 'react'
import type { Dispatch } from 'react'
import type { AttributeType } from '../model/mcd'
import type { McdAction } from '../model/mcdReducer'
import { DEFAULT_MPD_SETTINGS, proposedSqlType } from '../model/mpd'
import type { MpdSettings, SqlDialect } from '../model/mpd'
import { formatSqlType, parseSqlType, sqlTypeForDialect } from '../model/sqlTypes'
import { customBase, customIdOf } from '../model/customTypes'

export const SqlTypesContext = createContext<{ settings: MpdSettings; dispatch: Dispatch<McdAction>; readOnly: boolean; beginner?: boolean
  /** Demande un changement de moteur ou de version, avec bilan si besoin. Absent en lecture seule. */
  requestTarget?: (dialect: SqlDialect, version: string) => void }>({ settings: DEFAULT_MPD_SETTINGS, dispatch: () => {}, readOnly: true })
export function useSqlTypes() {
  const context = useContext(SqlTypesContext)
  return { ...context, physicalType: (id: string, type: AttributeType, size?: number) => {
    const raw = context.settings.overrides[id] ?? proposedSqlType(type, size, context.settings.dialect, context.settings.version)
    // Un type personnalisé s'affiche par son type de base dans le moteur choisi, ou par son nom sans base.
    const custom = context.settings.customTypes?.[customIdOf(raw) ?? '']
    if (custom) { const base = customBase(custom, context.settings.dialect); return base ? formatSqlType(base) : custom.name }
    const spec = parseSqlType(raw), mapped = spec && sqlTypeForDialect(spec, context.settings.dialect, context.settings.version)
    return mapped ? formatSqlType(mapped) : raw
  } }
}
