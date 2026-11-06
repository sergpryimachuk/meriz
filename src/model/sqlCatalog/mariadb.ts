import { MYSQL_CATALOG, MYSQL_TYPE_DEFINITIONS } from './mysql'
import type { EngineCatalog, SqlTypeDefinition } from './types'

const none = { kind: 'none' } as const

/** Types que MariaDB ajoute à la base MySQL. Versions relevées dans la documentation MariaDB. */
const MARIADB_EXTRAS = [
  // UUID_v4() comme DEFAULT figure dans la documentation. UUID() n'y figure pas.
  { name: 'UUID', family: 'identifiant', conceptual: 'texte', parameters: none, since: '10.7', defaults: [{ id: 'uuid_v4', sql: '(UUID_v4())', since: '11.7' }, { id: 'uuid_v7', sql: '(UUID_v7())', since: '11.7' }] },
  { name: 'INET4', family: 'reseau', conceptual: 'texte', parameters: none, since: '10.10' },
  { name: 'INET6', family: 'reseau', conceptual: 'texte', parameters: none },
  { name: 'VECTOR', family: 'autre', conceptual: 'texte', parameters: { kind: 'length', default: 2048, max: 16383 }, since: '11.7' },
] as const satisfies readonly SqlTypeDefinition[]

/**
 * MariaDB part des types MySQL et déclare ses écarts : son propre VECTOR,
 * et pas de DEFAULT (CURRENT_DATE), absent de sa documentation.
 */
export const MARIADB_TYPE_DEFINITIONS = [
  ...MYSQL_TYPE_DEFINITIONS.filter(definition => definition.name !== 'VECTOR').map(definition => definition.name === 'DATE' ? { ...definition, defaults: [] } : definition),
  ...MARIADB_EXTRAS,
] satisfies readonly SqlTypeDefinition[]

export const MARIADB_CATALOG: EngineCatalog = {
  dialect: 'mariadb',
  label: 'MariaDB',
  versions: [
    { id: '10.6', label: '10.6', supported: false },
    { id: '10.11', label: '10.11 LTS', supported: true },
    { id: '11.4', label: '11.4 LTS', supported: true },
    { id: '11.8', label: '11.8 LTS', supported: true },
    { id: '12.3', label: '12.3', supported: true },
  ],
  defaultVersion: '11.8',
  types: MARIADB_TYPE_DEFINITIONS,
  translations: { ...MYSQL_CATALOG.translations, INET: 'INET6' },
  propose: MYSQL_CATALOG.propose,
}
