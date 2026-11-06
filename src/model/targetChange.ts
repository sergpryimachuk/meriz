import { buildMpd } from './mpd'
import type { MpdSettings, SqlDialect } from './mpd'
import type { MldTable } from './mld'
import { parseSqlType, sqlTypeForDialect } from './sqlTypes'

export interface TargetChangeColumn {
  table: string
  column: string
  from: string
  to: string
}

/** Effet d'un changement de moteur ou de version, montré avant de l'appliquer. */
export interface TargetChangeImpact {
  /** Colonnes dont le type SQL change de nom ou de forme. */
  renamed: TargetChangeColumn[]
  /** Colonnes sans équivalent dans la cible : une décision reste à prendre. */
  unresolved: TargetChangeColumn[]
}

export function targetChangeImpact(tables: MldTable[], settings: MpdSettings, dialect: SqlDialect, version: string): TargetChangeImpact {
  const next: MpdSettings = { ...settings, dialect, version }
  const before = buildMpd(tables, settings), after = buildMpd(tables, next)
  const impact: TargetChangeImpact = { renamed: [], unresolved: [] }
  after.forEach((table, tableIndex) => table.columns.forEach((column, columnIndex) => {
    const from = before[tableIndex]?.columns[columnIndex]?.sqlType ?? column.sqlType
    const entry = { table: table.name, column: column.name, from, to: column.sqlType }
    const spec = parseSqlType(column.sqlType)
    if (!spec || !sqlTypeForDialect(spec, dialect, version)) impact.unresolved.push(entry)
    else if (column.unavailableDefault) impact.unresolved.push({ ...entry, to: column.sqlType + ' DEFAULT ' + column.unavailableDefault })
    else if (from !== column.sqlType) impact.renamed.push(entry)
  }))
  return impact
}

export const hasImpact = (impact: TargetChangeImpact): boolean => impact.renamed.length + impact.unresolved.length > 0
