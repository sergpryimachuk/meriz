import type { EngineCatalog, SqlTypeDefinition } from './types'

const none = { kind: 'none' } as const

const currentTimestamp = [{ id: 'current_timestamp', sql: 'CURRENT_TIMESTAMP' }] as const

export const POSTGRES_TYPE_DEFINITIONS = [
  { name: 'VARCHAR', aliases: ['CHARACTER VARYING'], family: 'chaine', conceptual: 'texte', parameters: { kind: 'length', default: 255, max: 65535 }, common: true },
  { name: 'CHAR', aliases: ['CHARACTER'], family: 'chaine', conceptual: 'texte', parameters: { kind: 'length', default: 1, max: 255 } },
  { name: 'TEXT', family: 'chaine', conceptual: 'texte', parameters: none, common: true },
  { name: 'INTEGER', family: 'entier', conceptual: 'entier', parameters: none, common: true },
  { name: 'BIGINT', family: 'entier', conceptual: 'entier', parameters: none, common: true },
  { name: 'SMALLINT', family: 'entier', conceptual: 'entier', parameters: none },
  { name: 'NUMERIC', family: 'decimal', conceptual: 'decimal', parameters: { kind: 'precision', maxPrecision: 1000, maxScale: 1000 }, common: true },
  { name: 'REAL', family: 'approche', conceptual: 'decimal', parameters: none },
  { name: 'DOUBLE PRECISION', family: 'approche', conceptual: 'decimal', parameters: none },
  { name: 'BOOLEAN', aliases: ['BOOL'], family: 'booleen', conceptual: 'booleen', parameters: none, common: true },
  { name: 'DATE', family: 'temps', conceptual: 'date', parameters: none, common: true, defaults: [{ id: 'current_date', sql: 'CURRENT_DATE' }] },
  { name: 'TIME', aliases: ['TIME WITHOUT TIME ZONE'], family: 'temps', conceptual: 'heure', parameters: none, common: true },
  { name: 'TIME WITH TIME ZONE', aliases: ['TIMETZ'], family: 'temps', conceptual: 'heure', parameters: none },
  { name: 'TIMESTAMP', aliases: ['TIMESTAMP WITHOUT TIME ZONE'], family: 'temps', conceptual: 'datetime', parameters: none, common: true, defaults: currentTimestamp },
  { name: 'TIMESTAMP WITH TIME ZONE', aliases: ['TIMESTAMPTZ'], family: 'temps', conceptual: 'datetime', parameters: none, defaults: currentTimestamp },
  { name: 'INTERVAL', family: 'temps', conceptual: 'texte', parameters: none },
  // gen_random_uuid() est intégré depuis PostgreSQL 13, uuidv7() depuis 18.
  { name: 'UUID', family: 'identifiant', conceptual: 'texte', parameters: none, defaults: [{ id: 'gen_random_uuid', sql: 'gen_random_uuid()' }, { id: 'uuidv7', sql: 'uuidv7()', since: '18' }] },
  { name: 'INET', family: 'reseau', conceptual: 'texte', parameters: none },
  { name: 'CIDR', family: 'reseau', conceptual: 'texte', parameters: none },
  { name: 'MACADDR', family: 'reseau', conceptual: 'texte', parameters: none },
  { name: 'JSON', family: 'document', conceptual: 'texte', parameters: none },
  { name: 'JSONB', family: 'document', conceptual: 'texte', parameters: none },
  { name: 'BYTEA', family: 'binaire', conceptual: 'texte', parameters: none },
] as const satisfies readonly SqlTypeDefinition[]

export const POSTGRES_CATALOG: EngineCatalog = {
  dialect: 'postgresql',
  label: 'PostgreSQL',
  versions: [
    { id: '14', label: '14', supported: true },
    { id: '15', label: '15', supported: true },
    { id: '16', label: '16', supported: true },
    { id: '17', label: '17', supported: true },
    { id: '18', label: '18', supported: true },
  ],
  defaultVersion: '17',
  types: POSTGRES_TYPE_DEFINITIONS,
  translations: { INT: 'INTEGER', MEDIUMINT: 'INTEGER', TINYINT: 'SMALLINT', MEDIUMTEXT: 'TEXT', LONGTEXT: 'TEXT', BINARY: 'BYTEA', DECIMAL: 'NUMERIC', FLOAT: 'REAL', DOUBLE: 'DOUBLE PRECISION', DATETIME: 'TIMESTAMP', BLOB: 'BYTEA', VARBINARY: 'BYTEA' },
  propose(type, size) {
    switch (type) {
      case 'texte': return `VARCHAR(${size ?? 255})`
      case 'entier': return 'INTEGER'
      case 'decimal': return 'NUMERIC(10,2)'
      case 'booleen': return 'BOOLEAN'
      case 'date': return 'DATE'
      case 'datetime': return 'TIMESTAMP'
      case 'heure': return 'TIME'
    }
  },
}
