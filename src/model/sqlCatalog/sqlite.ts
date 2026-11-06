import { t } from '../../i18n/runtime'
import type { EngineCatalog, SqlTypeDefinition } from './types'

const none = { kind: 'none' } as const

/** Dates et heures en TEXT au format ISO 8601 : SQLite fournit ces trois valeurs. */
const now = [
  { id: 'current_timestamp', sql: 'CURRENT_TIMESTAMP' },
  { id: 'current_date', sql: 'CURRENT_DATE' },
  { id: 'current_time', sql: 'CURRENT_TIME' },
] as const

/**
 * SQLite stocke par affinité. Une table STRICT (3.37+) n'accepte que
 * INT, INTEGER, REAL, TEXT, BLOB et ANY. NUMERIC reste réservé au mode
 * classique. SQLite n'a ni booléen, ni date, ni UUID natif.
 */
export const SQLITE_TYPE_DEFINITIONS = [
  { name: 'TEXT', family: 'chaine', conceptual: 'texte', parameters: none, common: true, defaults: now },
  { name: 'INTEGER', family: 'entier', conceptual: 'entier', parameters: none, common: true },
  // Mêmes paramètres que NUMERIC ailleurs : SQLite les lit sans les appliquer.
  { name: 'NUMERIC', family: 'decimal', conceptual: 'decimal', parameters: { kind: 'precision', maxPrecision: 1000, maxScale: 1000 }, until: '3.36' },
  { name: 'REAL', family: 'approche', conceptual: 'decimal', parameters: none, common: true },
  { name: 'BLOB', family: 'binaire', conceptual: 'texte', parameters: none },
  { name: 'ANY', family: 'autre', conceptual: 'texte', parameters: none, since: '3.37' },
] as const satisfies readonly SqlTypeDefinition[]

/** Version à partir de laquelle Meriz écrit des tables STRICT. */
export const SQLITE_STRICT_SINCE = '3.37'

export const SQLITE_CATALOG: EngineCatalog = {
  dialect: 'sqlite',
  label: 'SQLite',
  versions: [
    { id: '3.36', get label() { return t('classique') }, supported: true },
    { id: SQLITE_STRICT_SINCE, get label() { return t('3.37+ (STRICT)') }, supported: true },
  ],
  defaultVersion: SQLITE_STRICT_SINCE,
  types: SQLITE_TYPE_DEFINITIONS,
  translations: {
    INT: 'INTEGER', BIGINT: 'INTEGER', MEDIUMINT: 'INTEGER', SMALLINT: 'INTEGER', TINYINT: 'INTEGER', BOOLEAN: 'INTEGER', YEAR: 'INTEGER',
    VARCHAR: 'TEXT', CHAR: 'TEXT', MEDIUMTEXT: 'TEXT', LONGTEXT: 'TEXT', JSON: 'TEXT', JSONB: 'TEXT',
    DATE: 'TEXT', TIME: 'TEXT', DATETIME: 'TEXT', TIMESTAMP: 'TEXT', 'TIMESTAMP WITH TIME ZONE': 'TEXT', 'TIME WITH TIME ZONE': 'TEXT',
    DECIMAL: 'NUMERIC', FLOAT: 'REAL', DOUBLE: 'REAL', 'DOUBLE PRECISION': 'REAL',
    BYTEA: 'BLOB', BINARY: 'BLOB', VARBINARY: 'BLOB',
  },
  propose(type, _size, version) {
    switch (type) {
      case 'texte': return 'TEXT'
      case 'entier': return 'INTEGER'
      // NUMERIC n'existe pas en STRICT : un montant exact s'y garde en TEXT.
      case 'decimal': return version === '3.36' ? 'NUMERIC(10,2)' : 'TEXT'
      // CHECK (col IN (0, 1)) est ajouté à la génération.
      case 'booleen': return 'INTEGER'
      case 'date': case 'datetime': case 'heure': return 'TEXT'
    }
  },
}
