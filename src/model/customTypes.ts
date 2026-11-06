import { t } from '../i18n/runtime'
import { ATTRIBUTE_TYPES } from './mcd'
import type { AttributeType } from './mcd'
import { SQL_DIALECTS } from './mpd'
import type { SqlDialect } from './mpd'
import { parseSqlType, sqlTypeForDialect } from './sqlTypes'
import type { SqlTypeSpec } from './sqlTypes'

/**
 * Type personnalisé : un type physique nommé, défini une fois dans le
 * document, réutilisé par plusieurs propriétés. Il vit au MPD. Le MCD
 * n'en voit que le type conceptuel.
 */
export interface CustomSqlType {
  id: string
  /** Identifiant SQL : minuscules, chiffres et _. */
  name: string
  description?: string
  conceptual: AttributeType
  /** Type de base par moteur. Absent : type inutilisable sur ce moteur. */
  base: Partial<Record<SqlDialect, string>>
  check?: CustomTypeCheck
}

/** Contrainte sous forme fermée, jamais du SQL saisi. */
export type CustomTypeCheck =
  | { kind: 'values'; values: string[] }
  | { kind: 'range'; min?: number; max?: number }

/** Une surcharge MPD vise un type personnalisé par son id, pas par son nom : le renommer ne casse rien. */
const PREFIX = 'custom:'
export const customRef = (id: string): string => PREFIX + id
export const customIdOf = (raw: string | undefined): string | undefined => raw?.startsWith(PREFIX) ? raw.slice(PREFIX.length) : undefined

const NAME = /^[a-z][a-z0-9_]{0,62}$/

/** Type de base du moteur, ou null s'il manque ou ne lui appartient pas. */
export function customBase(type: CustomSqlType, dialect: SqlDialect): SqlTypeSpec | null {
  const raw = type.base[dialect]
  const spec = raw === undefined ? null : parseSqlType(raw)
  const native = spec && sqlTypeForDialect(spec, dialect)
  return native && native.name === spec.name ? native : null
}

const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'"

/** Condition SQL du contrôle, sur `subject` : VALUE pour un domaine, la colonne sinon. */
export function checkSql(check: CustomTypeCheck, subject: string): string {
  if (check.kind === 'values') return `${subject} IN (${check.values.map(literal).join(', ')})`
  const parts = [check.min !== undefined ? `${subject} >= ${check.min}` : '', check.max !== undefined ? `${subject} <= ${check.max}` : ''].filter(Boolean)
  return parts.join(' AND ')
}

/** Messages d'erreur, vides si le type est valide. `others` : les autres types du document. */
export function validateCustomType(type: CustomSqlType, others: readonly CustomSqlType[]): string[] {
  const errors: string[] = []
  if (!NAME.test(type.name)) errors.push(t('Le nom commence par une lettre minuscule, puis lettres minuscules, chiffres ou _.'))
  else if (parseSqlType(type.name)) errors.push(t('« {0} » est déjà un type SQL. Choisissez un autre nom.', [type.name]))
  else if (others.some(other => other.id !== type.id && other.name === type.name)) errors.push(t('Un autre type porte déjà ce nom.'))
  const engines = SQL_DIALECTS.filter(dialect => type.base[dialect.id] !== undefined)
  if (!engines.length) errors.push(t('Indiquez un type de base pour au moins un moteur.'))
  for (const dialect of engines) if (!customBase(type, dialect.id)) errors.push(t('Type de base invalide pour {0} : {1}.', [dialect.label, type.base[dialect.id] ?? '']))
  if (type.check?.kind === 'values') {
    const values = type.check.values
    if (!values.length || values.some(value => !value.trim()) || new Set(values).size !== values.length) errors.push(t('Les valeurs autorisées sont non vides et distinctes.'))
  }
  if (type.check?.kind === 'range') {
    const { min, max } = type.check
    if (type.conceptual !== 'entier' && type.conceptual !== 'decimal') errors.push(t('Un intervalle ne s’applique qu’à un nombre.'))
    if (min === undefined && max === undefined) errors.push(t('Indiquez un minimum, un maximum, ou les deux.'))
    if ([min, max].some(bound => bound !== undefined && !Number.isFinite(bound))) errors.push(t('Les bornes sont des nombres.'))
    if (min !== undefined && max !== undefined && min > max) errors.push(t('Le minimum dépasse le maximum.'))
  }
  return errors
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function parseCheck(raw: unknown): CustomTypeCheck | undefined {
  if (!isRecord(raw)) return undefined
  if (raw.kind === 'values' && Array.isArray(raw.values) && raw.values.every(value => typeof value === 'string')) return { kind: 'values', values: raw.values as string[] }
  if (raw.kind === 'range') {
    const bound = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined
    const min = bound(raw.min), max = bound(raw.max)
    return { kind: 'range', ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) }
  }
  return undefined
}

/** Lecture prudente, fichier ou document partagé : un type mal formé est écarté, pas deviné. */
export function parseCustomType(raw: unknown): CustomSqlType | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string' || !NAME.test(raw.name)) return null
  if (typeof raw.conceptual !== 'string' || !(ATTRIBUTE_TYPES as readonly string[]).includes(raw.conceptual) || !isRecord(raw.base)) return null
  const base: Partial<Record<SqlDialect, string>> = {}
  for (const dialect of SQL_DIALECTS) { const value = raw.base[dialect.id]; if (typeof value === 'string') base[dialect.id] = value }
  const check = parseCheck(raw.check)
  return {
    id: raw.id, name: raw.name, conceptual: raw.conceptual as AttributeType, base,
    ...(typeof raw.description === 'string' && raw.description ? { description: raw.description } : {}),
    ...(check ? { check } : {}),
  }
}

export function parseCustomTypes(raw: unknown): Record<string, CustomSqlType> {
  const types: Record<string, CustomSqlType> = {}
  if (!isRecord(raw)) return types
  for (const [id, value] of Object.entries(raw)) { const type = parseCustomType(value); if (type && type.id === id) types[id] = type }
  return types
}

/** Modèles proposés à l'ajout. Rien n'est ajouté sans action de l'utilisateur. */
export function customTypeTemplates(): Omit<CustomSqlType, 'id'>[] {
  return [
    { name: 'email', description: t('Adresse électronique, 320 caractères au plus.'), conceptual: 'texte', base: { mysql: 'VARCHAR(320)', mariadb: 'VARCHAR(320)', postgresql: 'VARCHAR(320)', sqlite: 'TEXT' } },
    // Pas de base SQLite : un montant exact y est du TEXT, qu'un CHECK numérique ne borne pas.
    { name: 'montant', description: t('Montant exact, positif ou nul.'), conceptual: 'decimal', base: { mysql: 'DECIMAL(12,2)', mariadb: 'DECIMAL(12,2)', postgresql: 'NUMERIC(12,2)' }, check: { kind: 'range', min: 0 } },
  ]
}
