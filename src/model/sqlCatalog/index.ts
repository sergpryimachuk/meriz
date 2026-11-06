import type { SqlDialect } from '../mpd'
import { MYSQL_CATALOG } from './mysql'
import { POSTGRES_CATALOG } from './postgresql'
import type { EngineCatalog, SqlTypeDefinition } from './types'

export type { EngineCatalog, EngineVersion, SqlTypeDefinition, SqlTypeFamily, SqlTypeParameters } from './types'
export { MYSQL_TYPE_DEFINITIONS } from './mysql'
export { POSTGRES_TYPE_DEFINITIONS } from './postgresql'

const CATALOGS: Readonly<Record<SqlDialect, EngineCatalog>> = { mysql: MYSQL_CATALOG, postgresql: POSTGRES_CATALOG }

export const catalogFor = (dialect: SqlDialect): EngineCatalog => CATALOGS[dialect]

/** Version connue du moteur, sinon sa version par défaut. */
export function resolveVersion(dialect: SqlDialect, version: string | undefined): string {
  const catalog = CATALOGS[dialect]
  return catalog.versions.some(known => known.id === version) ? version! : catalog.defaultVersion
}

export const isKnownVersion = (dialect: SqlDialect, version: string): boolean =>
  CATALOGS[dialect].versions.some(known => known.id === version)

/**
 * Vrai si la version atteint `since`. Une partie absente de la version
 * vaut sa dernière révision : « 8.0 » atteint « 8.0.13 », pas « 8.4 ».
 */
export function versionAtLeast(version: string, since: string): boolean {
  const have = version.split('.').map(Number), want = since.split('.').map(Number)
  for (let index = 0; index < want.length; index++) {
    const part = have[index]
    if (part === undefined) return true
    if (part !== want[index]) return part > want[index]!
  }
  return true
}

/** Le type existe dans cette version du moteur. */
export const availableIn = (definition: SqlTypeDefinition, version: string): boolean =>
  definition.since === undefined || versionAtLeast(version, definition.since)

/** Libellé lisible de la cible, par exemple « MySQL 8.4 LTS ». */
export function targetLabel(dialect: SqlDialect, version: string | undefined): string {
  const catalog = CATALOGS[dialect], resolved = resolveVersion(dialect, version)
  return catalog.label + ' ' + (catalog.versions.find(known => known.id === resolved)?.label ?? resolved)
}

/** Définition du type dans le moteur choisi. */
export const findSqlType = (dialect: SqlDialect, name: string): SqlTypeDefinition | undefined =>
  CATALOGS[dialect].types.find(definition => definition.name === name)

/**
 * Définition du type dans n'importe quel moteur, le moteur choisi en premier.
 * Sert à lire un type venu d'un autre moteur, avant sa traduction.
 */
export function anySqlType(name: string, preferred?: SqlDialect): SqlTypeDefinition | undefined {
  const order = preferred ? [CATALOGS[preferred], ...Object.values(CATALOGS)] : Object.values(CATALOGS)
  for (const catalog of order) {
    const found = catalog.types.find(definition => definition.name === name)
    if (found) return found
  }
  return undefined
}

/** Orthographe reconnue vers le nom canonique, tous moteurs confondus. */
export const SQL_TYPE_ALIASES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.values(CATALOGS).flatMap(catalog => catalog.types.flatMap(definition => (definition.aliases ?? []).map(alias => [alias, definition.name]))),
)
