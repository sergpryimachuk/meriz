import { describe, expect, it } from 'vitest'
import { parseMpdSettings } from '../lib/persistence'
import { doctrineColumn } from './frameworkSqlTypes'
import { mcdToMld } from './mld'
import { buildMpd, mpdToSql } from './mpd'
import type { MpdSettings } from './mpd'
import { defaultsFor } from './sqlCatalog'
import { sqlTypeNames } from './sqlTypes'
import { targetChangeImpact } from './targetChange'
import { clientCommande } from './testFixtures'

const tables = mcdToMld(clientCommande)
const referenced = tables.flatMap(table => table.columns).find(column => column.references)!.references!
const key = tables.find(table => table.id === referenced.tableId)!.columns.find(column => column.name === referenced.columnName)!

describe('MariaDB', () => {
  it('propose UUID à partir de 10.7, INET4 à partir de 10.10, VECTOR à partir de 11.7', () => {
    expect(sqlTypeNames('mariadb', '10.6')).not.toContain('UUID')
    expect(sqlTypeNames('mariadb', '10.6')).not.toContain('INET4')
    expect(sqlTypeNames('mariadb', '10.6')).toContain('INET6')
    expect(sqlTypeNames('mariadb', '10.11')).toEqual(expect.arrayContaining(['UUID', 'INET4']))
    expect(sqlTypeNames('mariadb', '11.4')).not.toContain('VECTOR')
    expect(sqlTypeNames('mariadb', '11.8')).toContain('VECTOR')
  })

  it('UUID_v4() par défaut demande 11.7 ; CURRENT_DATE n’est pas proposé', () => {
    expect(defaultsFor('mariadb', '11.4', 'UUID')).toEqual([])
    expect(defaultsFor('mariadb', '11.8', 'UUID').map(option => option.id)).toEqual(['uuid_v4', 'uuid_v7'])
    expect(defaultsFor('mariadb', '11.8', 'DATE')).toEqual([])
    const settings: MpdSettings = { dialect: 'mariadb', version: '11.8', overrides: { [key.id]: 'UUID' }, defaults: { [key.id]: 'uuid_v4' } }
    expect(mpdToSql(buildMpd(tables, settings), 'mariadb', { includeDrops: false })).toContain('UUID NOT NULL DEFAULT (UUID_v4())')
  })

  it('écrit le SQL avec la syntaxe MySQL', () => {
    const sql = mpdToSql(buildMpd(tables, { dialect: 'mariadb', overrides: {} }), 'mariadb', { includeDrops: false })
    expect(sql).toContain('`')
    expect(sql).toContain('AUTO_INCREMENT')
  })

  it('garde le UUID venu de PostgreSQL, le signale vers MySQL', () => {
    const fromPostgres: MpdSettings = { dialect: 'postgresql', version: '17', overrides: { [key.id]: 'UUID' } }
    expect(targetChangeImpact(tables, fromPostgres, 'mariadb', '11.8').unresolved).toEqual([])
    const fromMariadb: MpdSettings = { dialect: 'mariadb', version: '11.8', overrides: { [key.id]: 'UUID' } }
    expect(targetChangeImpact(tables, fromMariadb, 'mysql', '8.4').unresolved).toContainEqual(expect.objectContaining({ to: 'UUID' }))
    expect(targetChangeImpact(tables, fromMariadb, 'mariadb', '10.6').unresolved).toContainEqual(expect.objectContaining({ to: 'UUID' }))
  })

  it('est lu depuis un fichier, avec sa version', () => {
    expect(parseMpdSettings({ dialect: 'mariadb', version: '10.11', overrides: {} })).toEqual({ dialect: 'mariadb', version: '10.11', overrides: {} })
  })

  it('Doctrine garde le UUID natif par sa définition', () => {
    const column = { id: 'c', columnName: 'id', propertyName: 'id', conceptualType: 'texte' as const, sqlType: 'UUID', overridden: true, isPrimaryKey: true, autoIncrement: false, nullable: false }
    expect(doctrineColumn(column, 'mariadb').attribute).toContain("columnDefinition: 'UUID NOT NULL'")
  })
})
