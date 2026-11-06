import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { customRef } from '../src/model/customTypes'
import type { CustomSqlType } from '../src/model/customTypes'
import { exampleMcd } from '../src/model/example'
import type { Mcd } from '../src/model/mcd'
import { mcdToMld } from '../src/model/mld'
import { buildMpd, mpdToSql, SQL_DIALECTS } from '../src/model/mpd'
import type { MpdSettings, SqlDialect } from '../src/model/mpd'
import { physicalSchemaIssues } from '../src/model/physicalSchema'
import { catalogFor, defaultsFor } from '../src/model/sqlCatalog'
import { sqlTypeNames } from '../src/model/sqlTypes'
import * as fixtures from '../src/model/testFixtures'

/**
 * Écrit le SQL de chaque modèle de test pour chaque moteur et version,
 * dans MERIZ_SQL_OUT. scripts/sql-matrix.sh l'exécute ensuite sur de
 * vrais serveurs (compose.test.yaml). Sans la variable, rien ne tourne.
 */
const out = process.env.MERIZ_SQL_OUT

const models: Record<string, Mcd> = { exempleMcd: exampleMcd }
for (const [name, value] of Object.entries(fixtures)) if (value && typeof value === 'object' && 'entities' in value) models[name] = value as Mcd

/** Un modèle qui exerce UUID, valeurs par défaut et types personnalisés, selon ce que la cible propose. */
function featureSettings(dialect: SqlDialect, version: string): MpdSettings {
  const tables = mcdToMld(exampleMcd)
  const referenced = tables.flatMap(table => table.columns).find(column => column.references)!.references!
  const key = tables.find(table => table.id === referenced.tableId)!.columns.find(column => column.name === referenced.columnName)!
  const others = tables.flatMap(table => table.columns).filter(column => !column.references && !column.isPrimaryKey)
  const statut: CustomSqlType = { id: 'statut', name: 'statut', conceptual: 'texte', base: { mysql: 'VARCHAR(20)', mariadb: 'VARCHAR(20)', postgresql: 'VARCHAR(20)', sqlite: 'TEXT' }, check: { kind: 'values', values: ['ouvert', "l'autre"] } }
  const overrides: Record<string, string> = {}, defaults: Record<string, string> = {}
  if (others[0]) overrides[others[0].id] = customRef(statut.id)
  // Horodatage avec valeur par défaut, dans le type qui la propose.
  const stamp = ({ mysql: 'DATETIME', mariadb: 'DATETIME', postgresql: 'TIMESTAMP', sqlite: 'TEXT' } as const)[dialect]
  if (others[1]) { overrides[others[1].id] = stamp; defaults[others[1].id] = 'current_timestamp' }
  // UUID natif sur l'identifiant référencé, avec la plus récente des valeurs par défaut proposées.
  if (sqlTypeNames(dialect, version).includes('UUID')) {
    overrides[key.id] = 'UUID'
    const options = defaultsFor(dialect, version, 'UUID')
    if (options.length) defaults[key.id] = options[options.length - 1]!.id
  }
  return { dialect, version, overrides, defaults, customTypes: { statut } }
}

describe.skipIf(!out)('matrice SQL', () => {
  it('écrit un script par modèle, moteur et version', () => {
    mkdirSync(out!, { recursive: true })
    let count = 0
    for (const { id: dialect } of SQL_DIALECTS) for (const { id: version } of catalogFor(dialect).versions) {
      const cases: [string, Mcd, MpdSettings][] = [
        ...Object.entries(models).map(([name, mcd]): [string, Mcd, MpdSettings] => [name, mcd, { dialect, version, overrides: {} }]),
        ['fonctions', exampleMcd, featureSettings(dialect, version)],
      ]
      for (const [name, mcd, settings] of cases) {
        const tables = buildMpd(mcdToMld(mcd), settings)
        expect(physicalSchemaIssues(tables, dialect, version), `${dialect}@${version} ${name}`).toEqual([])
        writeFileSync(join(out!, `${dialect}@${version}__${name}.sql`), mpdToSql(tables, dialect, { includeDrops: true, version }) + '\n')
        count++
      }
    }
    expect(count).toBeGreaterThan(0)
  })
})
