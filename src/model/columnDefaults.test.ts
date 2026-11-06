import { describe, expect, it } from 'vitest'
import { parseMpdSettings } from '../lib/persistence'
import type { SchemaColumn } from './codeSchema'
import { doctrineCompatibilityWarnings } from './frameworkCompatibility'
import { blueprintColumn, doctrineColumn } from './frameworkSqlTypes'
import { mcdReducer } from './mcdReducer'
import { mcdToMld } from './mld'
import { createModelDoc } from './modelDoc'
import { buildMpd, mpdToSql } from './mpd'
import type { MpdSettings } from './mpd'
import { physicalSchemaIssues } from './physicalSchema'
import { formatSqlType, parseSqlType, sqlTypeForDialect } from './sqlTypes'
import { clientCommande } from './testFixtures'

const tables = mcdToMld(clientCommande)
// Identifiant simple d'une entité, référencé par une clé étrangère ailleurs.
const referenced = tables.flatMap(table => table.columns).find(column => column.references)!.references!
const key = tables.find(table => table.id === referenced.tableId)!.columns.find(column => column.name === referenced.columnName)!
const uuidKey = (version: string, defaultId: string): MpdSettings => ({ dialect: 'postgresql', version, overrides: { [key.id]: 'UUID' }, defaults: { [key.id]: defaultId } })

describe('valeurs par défaut calculées', () => {
  it('écrit DEFAULT gen_random_uuid() sur l’identifiant UUID', () => {
    const mpd = buildMpd(tables, uuidKey('17', 'gen_random_uuid'))
    expect(mpdToSql(mpd, 'postgresql', { includeDrops: false })).toContain('UUID NOT NULL DEFAULT gen_random_uuid()')
  })

  it('une clé étrangère garde le type UUID mais pas la valeur par défaut', () => {
    const foreign = buildMpd(tables, uuidKey('17', 'gen_random_uuid')).flatMap(table => table.columns).filter(column => column.references?.columnName === key.name)
    expect(foreign.length).toBeGreaterThan(0)
    for (const column of foreign) { expect(column.sqlType).toBe('UUID'); expect(column.defaultSql).toBeUndefined() }
  })

  it('uuidv7() existe en PostgreSQL 18, pas en 17', () => {
    expect(mpdToSql(buildMpd(tables, uuidKey('18', 'uuidv7')), 'postgresql', { includeDrops: false })).toContain('DEFAULT uuidv7()')
    const older = buildMpd(tables, uuidKey('17', 'uuidv7'))
    expect(older.flatMap(table => table.columns).find(column => column.id === key.id)?.unavailableDefault).toBe('uuidv7')
    expect(physicalSchemaIssues(older, 'postgresql', '17').join('\n')).toContain('uuidv7')
  })

  it('CURRENT_DATE sous MySQL demande la version 8.0.13', () => {
    const settings = (version: string): MpdSettings => ({ dialect: 'mysql', version, overrides: { [key.id]: 'DATE' }, defaults: { [key.id]: 'current_date' } })
    expect(mpdToSql(buildMpd(tables, settings('8.0')), 'mysql', { includeDrops: false })).toContain('DATE NOT NULL DEFAULT (CURRENT_DATE)')
    expect(buildMpd(tables, settings('5.7')).flatMap(table => table.columns).find(column => column.id === key.id)?.unavailableDefault).toBe('current_date')
  })

  it('changer pour un type sans cette valeur la retire ; null la retire aussi', () => {
    const state = { mcd: clientCommande, layout: {}, mpd: uuidKey('17', 'gen_random_uuid') }
    expect(mcdReducer(state, { type: 'SET_SQL_TYPE', propertyId: key.id, value: 'TEXT' }).mpd?.defaults).toEqual({})
    expect(mcdReducer(state, { type: 'SET_SQL_TYPE', propertyId: key.id, value: 'UUID' }).mpd?.defaults).toEqual({ [key.id]: 'gen_random_uuid' })
    expect(mcdReducer(state, { type: 'SET_COLUMN_DEFAULT', propertyId: key.id, value: null }).mpd?.defaults).toEqual({})
  })

  it('est enregistrée dans le fichier et dans le document partagé', () => {
    expect(parseMpdSettings({ dialect: 'postgresql', overrides: {}, defaults: { a: 'gen_random_uuid', b: "x'); DROP" } })?.defaults).toEqual({ a: 'gen_random_uuid' })
    const doc = createModelDoc({ mcd: clientCommande, layout: {} })
    doc.apply({ type: 'SET_COLUMN_DEFAULT', propertyId: key.id, value: 'current_timestamp' })
    expect(doc.snapshot().mpd?.defaults).toEqual({ [key.id]: 'current_timestamp' })
    doc.destroy()
  })
})

describe('exports avec valeur par défaut', () => {
  const column = (sqlType: string, defaultSql?: string): SchemaColumn => ({ id: 'c', columnName: 'cree_le', propertyName: 'creeLe', conceptualType: 'datetime', sqlType, overridden: true, isPrimaryKey: false, autoIncrement: false, nullable: false, ...(defaultSql ? { defaultSql } : {}) })

  it('Laravel : useCurrent pour CURRENT_TIMESTAMP, expression brute sinon', () => {
    expect(blueprintColumn(column('TIMESTAMP', 'CURRENT_TIMESTAMP'))).toBe("$table->timestamp('cree_le')->useCurrent()")
    expect(blueprintColumn(column('UUID', 'gen_random_uuid()'))).toBe("$table->uuid('cree_le')->default(new \\Illuminate\\Database\\Query\\Expression('gen_random_uuid()'))")
  })

  it('Doctrine : la définition native porte la valeur, et le parcours automatique est signalé', () => {
    expect(doctrineColumn(column('UUID', 'gen_random_uuid()'), 'postgresql').attribute).toContain("columnDefinition: 'UUID NOT NULL DEFAULT gen_random_uuid()'")
    const mpd = buildMpd(tables, uuidKey('17', 'gen_random_uuid'))
    expect(doctrineCompatibilityWarnings(uuidKey('17', 'gen_random_uuid'), mpd).join('\n')).toContain('gen_random_uuid()')
  })
})

describe('nouveaux types du catalogue', () => {
  it.each(['BINARY(16)', "SET('a','b')", 'VECTOR(3)', 'MEDIUMINT UNSIGNED', 'TIME WITH TIME ZONE', 'INET', 'INTERVAL'])('lit et réécrit %s', raw => {
    expect(formatSqlType(parseSqlType(raw)!)).toBe(raw)
  })

  it('reconnaît les abréviations PostgreSQL', () => {
    expect(parseSqlType('timestamptz')?.name).toBe('TIMESTAMP WITH TIME ZONE')
    expect(parseSqlType('timetz')?.name).toBe('TIME WITH TIME ZONE')
  })

  it('adapte les types MySQL qui ont un équivalent PostgreSQL, refuse les autres', () => {
    expect(sqlTypeForDialect(parseSqlType('MEDIUMTEXT')!, 'postgresql')?.name).toBe('TEXT')
    expect(sqlTypeForDialect(parseSqlType('BINARY(16)')!, 'postgresql')?.name).toBe('BYTEA')
    expect(sqlTypeForDialect(parseSqlType("SET('a')")!, 'postgresql')).toBeNull()
    expect(sqlTypeForDialect(parseSqlType('INET')!, 'mysql')).toBeNull()
  })
})
