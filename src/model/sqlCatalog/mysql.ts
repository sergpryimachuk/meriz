import type { EngineCatalog, SqlTypeDefinition } from './types'

const varLength = { kind: 'length', default: 255, max: 65535 } as const
const none = { kind: 'none' } as const

const currentTimestamp = [{ id: 'current_timestamp', sql: 'CURRENT_TIMESTAMP' }] as const

export const MYSQL_TYPE_DEFINITIONS = [
  { name: 'VARCHAR', family: 'chaine', conceptual: 'texte', parameters: varLength, common: true },
  { name: 'CHAR', family: 'chaine', conceptual: 'texte', parameters: { kind: 'length', default: 1, max: 255 } },
  { name: 'TEXT', family: 'chaine', conceptual: 'texte', parameters: none, common: true },
  { name: 'MEDIUMTEXT', family: 'chaine', conceptual: 'texte', parameters: none },
  { name: 'LONGTEXT', family: 'chaine', conceptual: 'texte', parameters: none },
  { name: 'INT', family: 'entier', conceptual: 'entier', parameters: none, unsigned: true, common: true },
  { name: 'BIGINT', family: 'entier', conceptual: 'entier', parameters: none, unsigned: true, common: true },
  { name: 'MEDIUMINT', family: 'entier', conceptual: 'entier', parameters: none, unsigned: true },
  { name: 'SMALLINT', family: 'entier', conceptual: 'entier', parameters: none, unsigned: true },
  { name: 'TINYINT', family: 'entier', conceptual: 'entier', parameters: none, unsigned: true },
  { name: 'DECIMAL', family: 'decimal', conceptual: 'decimal', parameters: { kind: 'precision', maxPrecision: 65, maxScale: 30 }, common: true },
  { name: 'FLOAT', family: 'approche', conceptual: 'decimal', parameters: none },
  { name: 'DOUBLE', family: 'approche', conceptual: 'decimal', parameters: none },
  { name: 'BOOLEAN', aliases: ['BOOL'], family: 'booleen', conceptual: 'booleen', parameters: none, common: true },
  // Défaut par expression, entre parenthèses, depuis MySQL 8.0.13.
  { name: 'DATE', family: 'temps', conceptual: 'date', parameters: none, common: true, defaults: [{ id: 'current_date', sql: '(CURRENT_DATE)', since: '8.0.13' }] },
  { name: 'TIME', family: 'temps', conceptual: 'heure', parameters: none, common: true },
  { name: 'DATETIME', family: 'temps', conceptual: 'datetime', parameters: none, common: true, defaults: currentTimestamp },
  { name: 'TIMESTAMP', family: 'temps', conceptual: 'datetime', parameters: none, common: true, defaults: currentTimestamp },
  { name: 'YEAR', family: 'temps', conceptual: 'entier', parameters: none },
  { name: 'JSON', family: 'document', conceptual: 'texte', parameters: none },
  { name: 'BLOB', family: 'binaire', conceptual: 'texte', parameters: none },
  // BINARY(16) : stockage compact d'un UUID, sans type UUID natif.
  { name: 'BINARY', family: 'binaire', conceptual: 'texte', parameters: { kind: 'length', default: 16, max: 255 } },
  { name: 'VARBINARY', family: 'binaire', conceptual: 'texte', parameters: varLength },
  { name: 'ENUM', family: 'autre', conceptual: 'texte', parameters: { kind: 'values' } },
  { name: 'SET', family: 'autre', conceptual: 'texte', parameters: { kind: 'values' } },
  // La longueur d'un VECTOR est son nombre de dimensions.
  { name: 'VECTOR', family: 'autre', conceptual: 'texte', parameters: { kind: 'length', default: 2048, max: 16383 }, since: '9.0' },
] as const satisfies readonly SqlTypeDefinition[]

export const MYSQL_CATALOG: EngineCatalog = {
  dialect: 'mysql',
  label: 'MySQL',
  versions: [
    { id: '5.7', label: '5.7', supported: false },
    { id: '8.0', label: '8.0', supported: false },
    { id: '8.4', label: '8.4 LTS', supported: true },
    { id: '9', label: '9.x', supported: true },
  ],
  defaultVersion: '8.4',
  types: MYSQL_TYPE_DEFINITIONS,
  translations: { INTEGER: 'INT', NUMERIC: 'DECIMAL', REAL: 'FLOAT', 'DOUBLE PRECISION': 'DOUBLE', BYTEA: 'BLOB' },
  propose(type, size) {
    switch (type) {
      case 'texte': return `VARCHAR(${size ?? 255})`
      case 'entier': return 'INT'
      case 'decimal': return 'DECIMAL(10,2)'
      // TINYINT(1) est l'alias BOOLEAN de MySQL.
      case 'booleen': return 'TINYINT(1)'
      case 'date': return 'DATE'
      case 'datetime': return 'DATETIME'
      case 'heure': return 'TIME'
    }
  },
}
