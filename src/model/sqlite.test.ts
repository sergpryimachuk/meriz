import { describe, expect, it } from 'vitest'
import { buildCodeSchema } from './codeSchema'
import { eloquentCast } from './frameworkSqlTypes'
import { mcdToMld } from './mld'
import { buildMpd, mpdToSql } from './mpd'
import type { MpdSettings } from './mpd'
import { sqlTypeNames } from './sqlTypes'
import { symfonyMigrationFile } from './symfonyMigration'
import { targetChangeImpact } from './targetChange'
import { clientCommande, tutorat } from './testFixtures'
import type { Mcd } from './mcd'

const sqlite = (version: string): MpdSettings => ({ dialect: 'sqlite', version, overrides: {} })
const sqlFor = (mcd: Mcd, version = '3.37') => mpdToSql(buildMpd(mcdToMld(mcd), sqlite(version)), 'sqlite', { includeDrops: true, version })

describe('SQLite', () => {
  it('active les clés étrangères et les écrit dans le CREATE TABLE', () => {
    const sql = sqlFor(clientCommande)
    expect(sql.startsWith('PRAGMA foreign_keys = ON;')).toBe(true)
    expect(sql).not.toContain('ALTER TABLE')
    expect(sql).toMatch(/CONSTRAINT "fk_\w+" FOREIGN KEY \("[^"]+"\) REFERENCES "\w+" \("[^"]+"\)/)
  })

  it('écrit l’identifiant entier comme INTEGER PRIMARY KEY, sans clause PRIMARY KEY en double', () => {
    const create = sqlFor(clientCommande).split('\n\n').find(block => block.startsWith('CREATE TABLE') && block.includes('INTEGER PRIMARY KEY'))!
    expect(create).toBeDefined()
    expect(create).not.toContain('  PRIMARY KEY (')
    expect(create).not.toContain('AUTO_INCREMENT')
  })

  it('STRICT en 3.37+, pas en mode classique', () => {
    expect(sqlFor(clientCommande, '3.37')).toContain(') STRICT;')
    expect(sqlFor(clientCommande, '3.36')).not.toContain('STRICT')
  })

  it('NUMERIC seulement en mode classique, ANY seulement en STRICT', () => {
    expect(sqlTypeNames('sqlite', '3.36')).toContain('NUMERIC')
    expect(sqlTypeNames('sqlite', '3.37')).not.toContain('NUMERIC')
    expect(sqlTypeNames('sqlite', '3.37')).toContain('ANY')
    expect(sqlTypeNames('sqlite', '3.36')).not.toContain('ANY')
  })

  it('borne un booléen à 0 et 1', () => {
    const mcd: Mcd = { ...clientCommande, properties: clientCommande.properties.map((property, index) => index === clientCommande.properties.length - 1 ? { ...property, type: 'booleen' } : property) }
    expect(sqlFor(mcd)).toMatch(/INTEGER( NOT NULL)? CHECK \("\w+" IN \(0, 1\)\)/)
  })

  it('adapte les types MySQL, et demande une décision pour UUID', () => {
    const tables = mcdToMld(clientCommande)
    const column = tables.flatMap(table => table.columns).find(candidate => !candidate.references)!
    const fromMysql: MpdSettings = { dialect: 'mysql', overrides: { [column.id]: 'VARCHAR(80)' } }
    expect(targetChangeImpact(tables, fromMysql, 'sqlite', '3.37').renamed).toContainEqual(expect.objectContaining({ from: 'VARCHAR(80)', to: 'TEXT' }))
    const fromPostgres: MpdSettings = { dialect: 'postgresql', version: '17', overrides: { [column.id]: 'UUID' } }
    expect(targetChangeImpact(tables, fromPostgres, 'sqlite', '3.37').unresolved).toContainEqual(expect.objectContaining({ to: 'UUID' }))
  })

  it('la migration Symfony retire les tables sans ALTER TABLE', () => {
    const settings = sqlite('3.37')
    const file = symfonyMigrationFile(buildCodeSchema(tutorat, mcdToMld(tutorat), settings), 'sqlite', '3.37')
    expect(file.content).not.toContain('DROP CONSTRAINT')
    expect(file.content).toContain('STRICT')
  })

  it('Eloquent relit un booléen SQLite comme booléen', () => {
    expect(eloquentCast({ id: 'c', columnName: 'actif', propertyName: 'actif', conceptualType: 'booleen', sqlType: 'INTEGER', overridden: false, isPrimaryKey: false, autoIncrement: false, nullable: false })).toBe('boolean')
  })
})
