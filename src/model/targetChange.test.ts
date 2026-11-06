import { describe, expect, it } from 'vitest'
import { parseMpdSettings } from '../lib/persistence'
import { mcdReducer } from './mcdReducer'
import type { McdEditorState } from './mcdReducer'
import { mcdToMld } from './mld'
import { createModelDoc } from './modelDoc'
import { DEFAULT_MPD_SETTINGS } from './mpd'
import type { MpdSettings } from './mpd'
import { availableIn, resolveVersion, targetLabel, versionAtLeast } from './sqlCatalog'
import { sqlTypeNames } from './sqlTypes'
import { hasImpact, targetChangeImpact } from './targetChange'
import { clientCommande } from './testFixtures'

describe('versions des moteurs', () => {
  it('une version courte vaut sa dernière révision', () => {
    expect(versionAtLeast('8.0', '8.0.13')).toBe(true)
    expect(versionAtLeast('5.7', '8.0.13')).toBe(false)
    expect(versionAtLeast('8.4', '8.0.13')).toBe(true)
    expect(versionAtLeast('9', '9.0')).toBe(true)
    expect(versionAtLeast('17', '18')).toBe(false)
  })

  it('une version inconnue ou absente prend le défaut du moteur', () => {
    expect(resolveVersion('mysql', undefined)).toBe('8.4')
    expect(resolveVersion('postgresql', '99')).toBe('17')
    expect(resolveVersion('postgresql', '15')).toBe('15')
    expect(targetLabel('mysql', undefined)).toBe('MySQL 8.4 LTS')
  })

  it('un type apparu plus tard est absent des versions plus anciennes', () => {
    const vector = { name: 'VECTOR', family: 'autre', conceptual: 'texte', parameters: { kind: 'none' }, since: '9.0' } as const
    expect(availableIn(vector, '8.4')).toBe(false)
    expect(availableIn(vector, '9')).toBe(true)
  })

  it('le catalogue actuel est complet dans toutes les versions', () => {
    expect(sqlTypeNames('mysql', '5.7')).toEqual(sqlTypeNames('mysql'))
    expect(sqlTypeNames('postgresql', '14')).toEqual(sqlTypeNames('postgresql'))
  })
})

describe('enregistrement de la version', () => {
  it('lit la version connue, ignore une version inconnue, accepte les anciens fichiers', () => {
    expect(parseMpdSettings({ dialect: 'postgresql', version: '15', overrides: {} })?.version).toBe('15')
    expect(parseMpdSettings({ dialect: 'postgresql', version: '42', overrides: {} })).toEqual({ dialect: 'postgresql', overrides: {} })
    expect(parseMpdSettings({ dialect: 'mysql', overrides: {} })).toEqual({ dialect: 'mysql', overrides: {} })
  })

  it('changer de moteur sans version prend la version par défaut du nouveau moteur', () => {
    const state: McdEditorState = { mcd: clientCommande, layout: {}, mpd: { ...DEFAULT_MPD_SETTINGS, version: '5.7' } }
    expect(mcdReducer(state, { type: 'SET_DIALECT', dialect: 'postgresql' }).mpd?.version).toBe('17')
    expect(mcdReducer(state, { type: 'SET_DIALECT', dialect: 'mysql', version: '9' }).mpd?.version).toBe('9')
  })

  it('le document partagé garde la version', () => {
    const doc = createModelDoc({ mcd: clientCommande, layout: {} })
    doc.apply({ type: 'SET_DIALECT', dialect: 'postgresql', version: '15' })
    expect(doc.snapshot().mpd).toMatchObject({ dialect: 'postgresql', version: '15' })
    doc.destroy()
  })
})

describe('bilan d’un changement de moteur', () => {
  const tables = mcdToMld(clientCommande)

  it('liste les types renommés de MySQL vers PostgreSQL', () => {
    const impact = targetChangeImpact(tables, DEFAULT_MPD_SETTINGS, 'postgresql', '17')
    expect(impact.unresolved).toEqual([])
    expect(impact.renamed.length).toBeGreaterThan(0)
    expect(impact.renamed.every(column => column.from !== column.to)).toBe(true)
    expect(impact.renamed).toContainEqual(expect.objectContaining({ from: 'INT', to: 'INTEGER' }))
  })

  it('signale un UUID sans équivalent sous MySQL', () => {
    const column = tables.flatMap(table => table.columns).find(candidate => !candidate.references)!
    const settings: MpdSettings = { dialect: 'postgresql', version: '17', overrides: { [column.id]: 'UUID' } }
    const impact = targetChangeImpact(tables, settings, 'mysql', '8.4')
    expect(impact.unresolved).toContainEqual(expect.objectContaining({ column: column.name, to: 'UUID' }))
  })

  it('changer seulement de version ne change rien aujourd’hui', () => {
    expect(hasImpact(targetChangeImpact(tables, DEFAULT_MPD_SETTINGS, 'mysql', '5.7'))).toBe(false)
  })
})
