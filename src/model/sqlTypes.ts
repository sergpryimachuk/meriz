import type { AttributeType } from './mcd'
import type { SqlDialect } from './mpd'
import { anySqlType, availableIn, catalogFor, findSqlType, MARIADB_TYPE_DEFINITIONS, MYSQL_TYPE_DEFINITIONS, POSTGRES_TYPE_DEFINITIONS, SQLITE_TYPE_DEFINITIONS, resolveVersion, SQL_TYPE_ALIASES } from './sqlCatalog'

/** Noms SQL réels ; pas de traductions ni de pseudo-types dans les sélecteurs. Le détail vit dans `sqlCatalog`. */
export const MYSQL_TYPES = MYSQL_TYPE_DEFINITIONS.map(definition => definition.name)
export const MARIADB_TYPES = MARIADB_TYPE_DEFINITIONS.map(definition => definition.name)
export const POSTGRES_TYPES = POSTGRES_TYPE_DEFINITIONS.map(definition => definition.name)
export const SQLITE_TYPES = SQLITE_TYPE_DEFINITIONS.map(definition => definition.name)
export type SqlTypeName = (typeof MYSQL_TYPES)[number] | (typeof MARIADB_TYPES)[number] | (typeof POSTGRES_TYPES)[number] | (typeof SQLITE_TYPES)[number]
export interface SqlTypeSpec { name: SqlTypeName; length?: number; precision?: number; scale?: number; values?: string[]; unsigned?: boolean }
const ALL_TYPES: readonly SqlTypeName[] = [...new Set<SqlTypeName>([...MYSQL_TYPES, ...MARIADB_TYPES, ...POSTGRES_TYPES, ...SQLITE_TYPES])]
const NAMES: Readonly<Record<SqlDialect, readonly SqlTypeName[]>> = { mysql: MYSQL_TYPES, mariadb: MARIADB_TYPES, postgresql: POSTGRES_TYPES, sqlite: SQLITE_TYPES }
/** Borne de lecture commune ; chaque moteur resserre ensuite la sienne. */
const PARSE_MAX_PRECISION = 1000
/** Types du moteur, limités à ceux de la version si elle est donnée. */
export function sqlTypeNames(dialect: SqlDialect, version?: string): readonly SqlTypeName[] {
  const names = NAMES[dialect]
  if (version === undefined) return names
  const resolved = resolveVersion(dialect, version)
  return names.filter(name => { const definition = findSqlType(dialect, name); return !definition || availableIn(definition, resolved) })
}
const parametersOf = (name: string) => anySqlType(name)?.parameters.kind ?? 'none'
export const isIntegerType = (name: string) => anySqlType(name)?.family === 'entier'
export const hasLength = (name: string) => parametersOf(name) === 'length'
export const hasPrecision = (name: string) => parametersOf(name) === 'precision'
/** Type défini par une liste de valeurs : ENUM, SET. */
export const hasValues = (name: string) => parametersOf(name) === 'values'
/** Type listé parmi les types courants, seul visible en mode débutant. */
export const isCommonType = (name: string) => anySqlType(name)?.common === true
/** Longueur maximale acceptée pour un type à longueur. */
export function maxLength(name: string): number {
  const parameters = anySqlType(name)?.parameters
  return parameters?.kind === 'length' ? parameters.max : 65535
}
/** Bornes de précision et de décimales du moteur choisi. */
export function precisionLimits(name: string, dialect: SqlDialect): { precision: number; scale: number } {
  const parameters = anySqlType(name, dialect)?.parameters
  return parameters?.kind === 'precision' ? { precision: parameters.maxPrecision, scale: parameters.maxScale } : { precision: PARSE_MAX_PRECISION, scale: PARSE_MAX_PRECISION }
}
/** UNSIGNED proposé pour ce type dans ce moteur. */
export const acceptsUnsigned = (name: string, dialect: SqlDialect) => findSqlType(dialect, name)?.unsigned === true
export function defaultSqlSpec(name: SqlTypeName): SqlTypeSpec {
  const parameters = anySqlType(name)?.parameters
  return { name, ...(parameters?.kind === 'length' ? { length: parameters.default } : {}), ...(parameters?.kind === 'precision' ? { precision: 10, scale: 2 } : {}), ...(parameters?.kind === 'values' ? { values: ['valeur1', 'valeur2'] } : {}) }
}
export function formatSqlType(spec: SqlTypeSpec): string {
  const args = hasLength(spec.name) ? `(${spec.length ?? 255})` : hasPrecision(spec.name) ? `(${spec.precision ?? 10},${spec.scale ?? 2})` : parametersOf(spec.name) === 'values' ? '(' + (spec.values ?? []).map(v => "'" + v.replaceAll("'", "''") + "'").join(',') + ')' : ''
  return spec.name + args + (spec.unsigned ? ' UNSIGNED' : '')
}

/** Reconnaît aussi les variantes déjà enregistrées, sans accepter de fragment SQL. */
export function parseSqlType(raw: string): SqlTypeSpec | null {
  const match = raw.trim().match(/^([a-z][a-z ]*?)(?:\(([^]*)\))?(\s+UNSIGNED)?$/i)
  if (!match) return null
  const spelling = match[1]!.trim().replace(/\s+/g, ' ').toUpperCase()
  const name = ALL_TYPES.find(known => known === (SQL_TYPE_ALIASES[spelling] ?? spelling))
  if (!name) return null
  const spec: SqlTypeSpec = { name }
  const args = match[2]
  if (hasLength(name)) {
    if (args !== undefined && !/^\d+$/.test(args.trim())) return null
    spec.length = args === undefined ? defaultSqlSpec(name).length : Number(args)
    if (spec.length === undefined || spec.length < 1 || spec.length > maxLength(name)) return null
  } else if (hasPrecision(name)) {
    if (args !== undefined && !/^\s*\d+\s*(,\s*\d+\s*)?$/.test(args)) return null
    const parts = args?.split(',').map(Number)
    spec.precision = parts?.[0] ?? 10; spec.scale = parts?.[1] ?? (parts ? 0 : 2)
    if (spec.precision < 1 || spec.precision > PARSE_MAX_PRECISION || spec.scale < 0 || spec.scale > spec.precision) return null
  } else if (parametersOf(name) === 'values') {
    if (!args) return null
    const values: string[] = []; const expression = /\s*'((?:[^'\\]|'')*)'\s*(,|$)/gy
    let cursor = 0
    while (cursor < args.length) { expression.lastIndex = cursor; const value = expression.exec(args); if (!value) return null; values.push(value[1]!.replaceAll("''", "'")); cursor = expression.lastIndex; if (value[2] === ',' && cursor === args.length) return null }
    if (!values.length || new Set(values).size !== values.length) return null
    spec.values = values
  } else if (args !== undefined) {
    // Alias historique BOOLEAN de MySQL.
    if (name === 'TINYINT' && args.trim() === '1') return { name: 'BOOLEAN' }
    return null
  }
  if (match[3]) { if (!isIntegerType(name)) return null; spec.unsigned = true }
  return spec
}
export function conceptualTypeFor(spec: SqlTypeSpec): AttributeType {
  return anySqlType(spec.name)?.conceptual ?? 'texte'
}
/** Le type dans le moteur choisi, ou null s'il n'y a pas d'équivalent, y compris dans la version donnée. */
export function sqlTypeForDialect(spec: SqlTypeSpec, dialect: SqlDialect, version?: string): SqlTypeSpec | null {
  const wanted = catalogFor(dialect).translations[spec.name] ?? spec.name
  const name = sqlTypeNames(dialect, version).find(known => known === wanted)
  if (!name) return null
  if (spec.unsigned && !acceptsUnsigned(name, dialect)) return null
  if (hasPrecision(name)) {
    const limits = precisionLimits(name, dialect)
    if ((spec.precision ?? 10) > limits.precision || (spec.scale ?? 2) > limits.scale) return null
  }
  return { ...spec, name }
}
