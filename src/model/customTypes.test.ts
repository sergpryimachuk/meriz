import { describe, expect, it } from 'vitest'
import { parseMpdSettings } from '../lib/persistence'
import { buildCodeSchema } from './codeSchema'
import { customRef, customTypeTemplates, validateCustomType } from './customTypes'
import type { CustomSqlType } from './customTypes'
import { blueprintColumn, doctrineColumn } from './frameworkSqlTypes'
import { laravelMigrationFile } from './laravelMigration'
import { mcdReducer } from './mcdReducer'
import { mcdToMld } from './mld'
import { createModelDoc } from './modelDoc'
import { buildMpd, mpdToSql } from './mpd'
import type { MpdSettings, SqlDialect } from './mpd'
import { physicalSchemaIssues } from './physicalSchema'
import { targetChangeImpact } from './targetChange'
import { clientCommande } from './testFixtures'

const tables = mcdToMld(clientCommande)
// Identifiant référencé ailleurs, et une propriété ordinaire.
const referenced = tables.flatMap(table => table.columns).find(column => column.references)!.references!
const key = tables.find(table => table.id === referenced.tableId)!.columns.find(column => column.name === referenced.columnName)!
const plain = tables.flatMap(table => table.columns).find(column => !column.references && !column.isPrimaryKey)!

const statut: CustomSqlType = { id: 't1', name: 'statut', conceptual: 'texte', base: { mysql: 'VARCHAR(20)', mariadb: 'VARCHAR(20)', postgresql: 'VARCHAR(20)', sqlite: 'TEXT' }, check: { kind: 'values', values: ['ouvert', "l'autre"] } }
const code: CustomSqlType = { id: 't2', name: 'code_client', conceptual: 'texte', base: { postgresql: 'UUID', mariadb: 'UUID' } }
const settings = (dialect: SqlDialect, version?: string): MpdSettings => ({ dialect, ...(version ? { version } : {}), overrides: { [plain.id]: customRef('t1'), [key.id]: customRef('t2') }, customTypes: { t1: statut, t2: code } })
const sql = (dialect: SqlDialect, version?: string) => mpdToSql(buildMpd(tables, settings(dialect, version)), dialect, { includeDrops: true, version })

describe('validation des types personnalisés', () => {
  it('accepte les modèles fournis', () => {
    for (const template of customTypeTemplates()) expect(validateCustomType({ ...template, id: template.name }, [])).toEqual([])
  })

  it('refuse un nom mal formé, déjà pris ou qui est un type SQL', () => {
    expect(validateCustomType({ ...statut, name: 'Statut' }, [])).toHaveLength(1)
    expect(validateCustomType({ ...statut, name: 'text' }, [])[0]).toContain('déjà un type SQL')
    expect(validateCustomType({ ...statut, id: 'autre' }, [statut])[0]).toContain('déjà ce nom')
  })

  it('refuse une base étrangère au moteur, ou aucune base', () => {
    expect(validateCustomType({ ...statut, base: { sqlite: 'VARCHAR(20)' } }, []).join()).toContain('SQLite')
    expect(validateCustomType({ ...statut, base: { mysql: 'UUID' } }, []).join()).toContain('MySQL')
    expect(validateCustomType({ ...statut, base: {} }, [])).toHaveLength(1)
  })

  it('n’accepte un intervalle que sur un nombre, dans le bon ordre', () => {
    expect(validateCustomType({ ...statut, check: { kind: 'range', min: 0 } }, []).join()).toContain('nombre')
    const amount: CustomSqlType = { id: 'm', name: 'note', conceptual: 'entier', base: { mysql: 'INT' }, check: { kind: 'range', min: 20, max: 0 } }
    expect(validateCustomType(amount, []).join()).toContain('dépasse')
  })
})

describe('SQL des types personnalisés', () => {
  it('PostgreSQL : un domaine par type, utilisé par la colonne et par la clé étrangère', () => {
    const script = sql('postgresql', '17')
    expect(script).toContain(`CREATE DOMAIN "statut" AS VARCHAR(20) CHECK (VALUE IN ('ouvert', 'l''autre'));`)
    expect(script).toContain('CREATE DOMAIN "code_client" AS UUID;')
    expect(script.match(/"code_client" NOT NULL/g)?.length).toBeGreaterThanOrEqual(2)
    expect(script).toContain('DROP DOMAIN IF EXISTS "statut";')
    expect(script.indexOf('CREATE DOMAIN')).toBeLessThan(script.indexOf('CREATE TABLE'))
  })

  it('MySQL et SQLite : la base et le contrôle sont recopiés dans la colonne', () => {
    expect(sql('sqlite', '3.37')).toMatch(/TEXT NOT NULL CHECK \("\w+" IN \('ouvert', 'l''autre'\)\)/)
    expect(sql('mariadb', '11.8')).toMatch(/VARCHAR\(20\) NOT NULL CHECK \(`\w+` IN \('ouvert', 'l''autre'\)\)/)
    expect(sql('mariadb', '11.8')).not.toContain('DOMAIN')
  })

  it('un type sans base pour le moteur est signalé et bloque l’export', () => {
    const mpd = buildMpd(tables, settings('mysql'))
    expect(physicalSchemaIssues(mpd, 'mysql').join('\n')).toContain('code_client')
    expect(targetChangeImpact(tables, settings('postgresql', '17'), 'mysql', '8.4').unresolved).toContainEqual(expect.objectContaining({ to: 'code_client' }))
  })
})

describe('édition et enregistrement', () => {
  const state = { mcd: clientCommande, layout: {}, mpd: { dialect: 'postgresql' as const, overrides: {}, customTypes: { t1: statut } } }

  it('choisir un type personnalisé donne son type conceptuel à la propriété', () => {
    const number: CustomSqlType = { id: 'n', name: 'quantite', conceptual: 'entier', base: { postgresql: 'INTEGER' } }
    const next = mcdReducer(mcdReducer(state, { type: 'SET_CUSTOM_TYPE', customType: number }), { type: 'SET_SQL_TYPE', propertyId: plain.id, value: customRef('n') })
    expect(next.mcd.properties.find(property => property.id === plain.id)?.type).toBe('entier')
    const renamed = mcdReducer(next, { type: 'SET_CUSTOM_TYPE', customType: { ...number, conceptual: 'decimal' } })
    expect(renamed.mcd.properties.find(property => property.id === plain.id)?.type).toBe('decimal')
  })

  it('supprimer le type rend la propriété au type proposé', () => {
    const used = mcdReducer(state, { type: 'SET_SQL_TYPE', propertyId: plain.id, value: customRef('t1') })
    const next = mcdReducer(used, { type: 'DELETE_CUSTOM_TYPE', id: 't1' })
    expect(next.mpd?.overrides[plain.id]).toBeUndefined()
    expect(next.mpd?.customTypes).toEqual({})
  })

  it('le fichier garde les types valides et écarte les autres', () => {
    const parsed = parseMpdSettings({ dialect: 'mysql', overrides: {}, customTypes: { t1: statut, bad: { id: 'bad', name: 'Mauvais', conceptual: 'texte', base: {} }, t9: { ...statut, id: 'autre' } } })
    expect(parsed?.customTypes).toEqual({ t1: statut })
  })

  it('le document partagé garde les types et les retire', () => {
    const doc = createModelDoc({ mcd: clientCommande, layout: {}, mpd: { dialect: 'mysql', overrides: {} } })
    doc.apply({ type: 'SET_CUSTOM_TYPE', customType: statut })
    expect(doc.snapshot().mpd?.customTypes).toEqual({ t1: statut })
    doc.apply({ type: 'DELETE_CUSTOM_TYPE', id: 't1' })
    expect(doc.snapshot().mpd?.customTypes ?? {}).toEqual({})
    doc.destroy()
  })
})

describe('exports avec types personnalisés', () => {
  const schema = buildCodeSchema(clientCommande, tables, settings('mariadb', '11.8'))
  const column = schema.tables.flatMap(table => table.columns).find(candidate => candidate.id === plain.id)!

  it('Laravel : type de base, et le contrôle à reprendre en commentaire', () => {
    expect(blueprintColumn(column)).toContain("string('")
    const table = schema.tables.find(candidate => candidate.columns.includes(column))!
    const file = laravelMigrationFile(table, schema, 0, false)
    expect(file.content).toContain('// Type personnalisé statut : VARCHAR(20)')
    expect(file.content).toContain("CHECK (" + column.columnName + " IN ('ouvert', 'l''autre'))")
  })

  it('Doctrine : le contrôle passe par la définition native', () => {
    expect(doctrineColumn(column, 'mariadb').attribute).toContain('CHECK (')
  })
})
