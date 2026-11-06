import { describe, expect, it } from 'vitest'
import { ATTRIBUTE_TYPES } from '../mcd'
import { SQL_DIALECTS } from '../mpd'
import { parseSqlType, sqlTypeForDialect } from '../sqlTypes'
import { anySqlType, catalogFor, SQL_TYPE_ALIASES } from '.'

const catalogs = SQL_DIALECTS.map(dialect => catalogFor(dialect.id))

describe('catalogue des types SQL', () => {
  it.each(catalogs)('$dialect : noms uniques, alias distincts des noms', catalog => {
    const names = catalog.types.map(type => type.name)
    expect(new Set(names).size).toBe(names.length)
    for (const type of catalog.types) for (const alias of type.aliases ?? []) expect(names).not.toContain(alias)
  })

  it('un nom partagé par deux moteurs a la même forme de paramètres', () => {
    for (const catalog of catalogs) for (const type of catalog.types) {
      expect(anySqlType(type.name)?.parameters.kind).toBe(type.parameters.kind)
    }
  })

  it('un alias désigne un seul type', () => {
    for (const [alias, name] of Object.entries(SQL_TYPE_ALIASES)) expect(anySqlType(name), alias).toBeDefined()
  })

  it.each(catalogs)('$dialect : chaque traduction vise un type du moteur', catalog => {
    const names = catalog.types.map(type => type.name)
    for (const target of Object.values(catalog.translations)) expect(names).toContain(target)
  })

  it.each(catalogs)('$dialect : chaque proposition est un type valide du moteur', catalog => {
    for (const type of ATTRIBUTE_TYPES) {
      const spec = parseSqlType(catalog.propose(type, 80))
      expect(spec, type).not.toBeNull()
      expect(sqlTypeForDialect(spec!, catalog.dialect), type).not.toBeNull()
    }
  })
})
