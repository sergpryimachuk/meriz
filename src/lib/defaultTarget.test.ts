import { describe, expect, it } from 'vitest'
import { parseDefaultTarget } from './defaultTarget'

describe('moteur par défaut de l’installation', () => {
  it('lit un moteur, avec ou sans version', () => {
    expect(parseDefaultTarget('postgresql@17')).toEqual({ dialect: 'postgresql', version: '17', overrides: {} })
    expect(parseDefaultTarget(' MariaDB@11.8 ')).toEqual({ dialect: 'mariadb', version: '11.8', overrides: {} })
    expect(parseDefaultTarget('sqlite')).toEqual({ dialect: 'sqlite', overrides: {} })
  })

  it('refuse un moteur ou une version inconnus, et une forme fausse', () => {
    for (const raw of ['oracle@19', 'postgresql@99', 'mysql@8.4@1', '', undefined]) expect(parseDefaultTarget(raw)).toBeNull()
  })
})
