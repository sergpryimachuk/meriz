import { quoteSqlName } from './sqlIdentifiers'
import { sourcePropertyId } from './mld'
import { parseSqlType, sqlTypeForDialect, formatSqlType, isIntegerType } from './sqlTypes'
import { t } from "../i18n/runtime"
import type { AttributeType } from './mcd'
import type { MldColumn, MldTable } from './mld'
import { sanitizeSqlName } from './sql'
import { catalogFor, defaultsFor, sqliteStrict, usesMysqlSyntax } from './sqlCatalog'
import { checkSql, customBase, customIdOf } from './customTypes'
import type { CustomSqlType, CustomTypeCheck } from './customTypes'

/**
 * MPD : le modèle physique. Structure dérivée du MLD (jamais éditée),
 * plus une couche de mappage de types éditable et mémorisée : le
 * dialecte et les surcharges de type par colonne. C'est ici, et
 * seulement ici, que les types conceptuels deviennent des types SQL.
 */

export type SqlDialect = 'mysql' | 'mariadb' | 'postgresql' | 'sqlite'

export const SQL_DIALECTS: readonly { id: SqlDialect; label: string }[] = [
  { id: 'mysql', get label() { return t("MySQL") } },
  { id: 'mariadb', get label() { return t("MariaDB") } },
  { id: 'postgresql', get label() { return t("PostgreSQL") } },
  { id: 'sqlite', get label() { return t("SQLite") } },
]

/** Réglages mémorisés : dialecte + surcharges par colonne (id stable). */
export interface MpdSettings {
  dialect: SqlDialect
  /** Version du moteur. Absente : version par défaut du moteur. */
  version?: string
  overrides: Record<string, string>
  identity?: Record<string, boolean>
  /** Valeur par défaut choisie par propriété : l'id d'un `ColumnDefault` du catalogue. */
  defaults?: Record<string, string>
  /** Types personnalisés du document, par id. */
  customTypes?: Record<string, CustomSqlType>
}

export const DEFAULT_MPD_SETTINGS: MpdSettings = { dialect: 'mysql', overrides: {} }

/** Type SQL proposé pour un type conceptuel, selon le dialecte. */
export function proposedSqlType(type: AttributeType, size: number | undefined, dialect: SqlDialect, version?: string): string {
  return catalogFor(dialect).propose(type, size, version)
}

export interface MpdColumn {
  id: string
  name: string
  conceptualType: AttributeType
  /** Type SQL proposé par le mappage du dialecte. */
  proposedType: string
  /** Type SQL final : la surcharge de l'utilisateur, sinon la proposition. */
  sqlType: string
  overridden: boolean
  isPrimaryKey: boolean
  nullable: boolean
  /** PK simple, entière, sans surcharge : auto-incrément pertinent. */
  autoIncrement: boolean
  /** SQL écrit après DEFAULT, si la valeur choisie existe dans le moteur. */
  defaultSql?: string
  /** Valeur choisie mais absente du moteur ou de la version : à corriger avant l'export. */
  unavailableDefault?: string
  /**
   * Type personnalisé choisi. `sqlType` porte alors son type de base ;
   * `unavailable` : pas de base pour ce moteur, `sqlType` porte son nom.
   */
  customType?: { id: string; name: string; check?: CustomTypeCheck; unavailable?: boolean }
  references?: MldColumn['references']
}

export interface MpdTable {
  id: string
  name: string
  columns: MpdColumn[]
}

/** Dérive le MPD : structure du MLD + types SQL selon les réglages. */
export function buildMpd(tables: MldTable[], settings: MpdSettings): MpdTable[] {
  return tables.map((table) => {
    const primaryKeys = table.columns.filter((c) => c.isPrimaryKey)
    return {
      id: table.id,
      name: table.name,
      columns: table.columns.map((column): MpdColumn => {
        const proposed = proposedSqlType(column.type, column.size, settings.dialect, settings.version)
        // Une FK hérite du type physique de la colonne visée, même si celui-ci change en direct.
        const sourceId = sourcePropertyId(column, tables)
        const override = (settings.overrides[column.id] ?? settings.overrides[sourceId])?.trim()
        const overridden = override !== undefined && override !== ''
        const explicitIdentity = settings.identity?.[sourceId]
        const custom = overridden ? settings.customTypes?.[customIdOf(override) ?? ''] : undefined
        const customSpec = custom ? customBase(custom, settings.dialect) : null
        const source = custom ? (customSpec ? formatSqlType(customSpec) : custom.name) : overridden ? override : proposed
        const parsed = parseSqlType(source)
        const translated = parsed && sqlTypeForDialect(parsed, settings.dialect, settings.version)
        const finalType = translated ? formatSqlType(translated) : source
        const autoIncrement =
          column.isPrimaryKey &&
          primaryKeys.length === 1 &&
          column.references === undefined &&
          (explicitIdentity === true ? !!parsed && isIntegerType(parsed.name) : explicitIdentity !== false && column.type === 'entier' && !overridden)
        // Une clé étrangère n'hérite jamais de la valeur par défaut de la colonne visée.
        const defaultId = column.references ? undefined : settings.defaults?.[column.id]
        const offered = defaultId && translated ? defaultsFor(settings.dialect, settings.version, translated.name).find(option => option.id === defaultId) : undefined
        return {
          id: column.id,
          name: column.name,
          conceptualType: column.type,
          proposedType: proposed,
          sqlType: finalType,
          overridden,
          isPrimaryKey: column.isPrimaryKey,
          nullable: column.nullable,
          autoIncrement,
          ...(offered ? { defaultSql: offered.sql } : defaultId ? { unavailableDefault: defaultId } : {}),
          ...(custom ? { customType: { id: custom.id, name: custom.name, ...(custom.check ? { check: custom.check } : {}), ...(customSpec ? {} : { unavailable: true }) } } : {}),
          references: column.references,
        }
      }),
    }
  })
}

/**
 * Tri topologique : une table est créée après celles qu'elle
 * référence (auto-référence permise). En cas de cycle, l'ordre
 * d'origine est conservé pour le reste. Avec les clés étrangères en
 * ALTER TABLE l'ordre des CREATE importe moins, mais celui des DROP
 * reste sensible.
 */
export function sortForCreation(tables: MpdTable[]): MpdTable[] {
  const remaining = new Map(tables.map((table) => [table.id, table]))
  const dependencies = new Map<string, string[]>(
    tables.map((table) => [
      table.id,
      table.columns
        .filter((c) => c.references !== undefined && c.references.tableId !== table.id)
        .map((c) => c.references?.tableId ?? ''),
    ]),
  )
  const sorted: MpdTable[] = []
  while (remaining.size > 0) {
    let progressed = false
    for (const [id, table] of remaining) {
      const blocked = (dependencies.get(id) ?? []).some((dep) => remaining.has(dep))
      if (!blocked) {
        sorted.push(table)
        remaining.delete(id)
        progressed = true
      }
    }
    if (!progressed) {
      sorted.push(...remaining.values())
      break
    }
  }
  return sorted
}

export interface SqlOptions {
  includeDrops: boolean
  /** Version du moteur. Sous SQLite, elle décide des tables STRICT. */
  version?: string
}

/**
 * Dérivation pure MPD → SQL. Les CREATE TABLE d'abord (types, NOT
 * NULL, clé primaire, auto-incrément adapté au dialecte), puis toutes
 * les clés étrangères en ALTER TABLE ADD CONSTRAINT, avec des noms
 * lisibles et déterministes. DROP TABLE IF EXISTS optionnels, en
 * ordre inverse des dépendances.
 *
 * SQLite ne sait pas ajouter une contrainte par ALTER TABLE : ses clés
 * étrangères vont dans le CREATE TABLE. Il ne vérifie une clé qu'à
 * l'écriture, donc l'ordre de création et les cycles ne le gênent pas.
 */
export function mpdToSql(tables: MpdTable[], dialect: SqlDialect, options: SqlOptions): string {
  const ordered = sortForCreation(tables)
  const parts: string[] = []
  const sqlite = dialect === 'sqlite'
  const inlineKeys = sqlite ? foreignConstraints(tables) : []
  // Sans ce réglage, SQLite ignore les clés étrangères.
  if (sqlite) parts.push('PRAGMA foreign_keys = ON;')
  // PostgreSQL a de vrais domaines. Ailleurs, le type de base et son contrôle sont recopiés dans la colonne.
  const domains = dialect === 'postgresql' ? customDomains(tables) : []

  if (options.includeDrops) {
    parts.push(
      [...ordered]
        .reverse()
        .map((table) => ("DROP TABLE IF EXISTS " + String(quoteSqlName(table.name, dialect)) + ";"))
        .concat(domains.map(domain => 'DROP DOMAIN IF EXISTS ' + quoteSqlName(domain.name, dialect) + ';'))
        .join('\n'),
    )
  }
  if (domains.length) parts.push(domains.map(domain => 'CREATE DOMAIN ' + quoteSqlName(domain.name, dialect) + ' AS ' + domain.sqlType + (domain.check ? ' CHECK (' + checkSql(domain.check, 'VALUE') + ')' : '') + ';').join('\n'))

  for (const table of ordered) {
    const lines: string[] = []
    // INTEGER PRIMARY KEY est l'alias du rowid : l'auto-incrément de SQLite.
    const rowid = sqlite ? table.columns.find(c => c.autoIncrement && c.sqlType === 'INTEGER') : undefined
    for (const column of table.columns) {
      const name = quoteSqlName(column.name, dialect)
      if (column === rowid) { lines.push(`  ${name} INTEGER PRIMARY KEY`); continue }
      const domain = dialect === 'postgresql' && column.customType && !column.customType.unavailable
      let typePart = domain ? quoteSqlName(column.customType!.name, dialect) : column.sqlType
      if (column.autoIncrement && dialect === 'postgresql') {
        // SERIAL remplace le type et porte l'auto-incrément.
        typePart = column.sqlType === 'BIGINT' ? 'BIGSERIAL' : column.sqlType === 'SMALLINT' ? 'SMALLSERIAL' : 'SERIAL'
      }
      const autoIncrementPart =
        column.autoIncrement && usesMysqlSyntax(dialect) ? ' AUTO_INCREMENT' : ''
      const nullability = column.nullable ? '' : ' NOT NULL'
      const defaultPart = column.defaultSql ? ' DEFAULT ' + column.defaultSql : ''
      // SQLite n'a pas de booléen : l'entier est borné à 0 et 1.
      const checks = [
        sqlite && column.conceptualType === 'booleen' && column.sqlType === 'INTEGER' ? `${name} IN (0, 1)` : '',
        !domain && column.customType?.check ? checkSql(column.customType.check, name) : '',
      ].filter(Boolean)
      const checkPart = checks.map(condition => ` CHECK (${condition})`).join('')
      lines.push(`  ${name} ${typePart}${nullability}${defaultPart}${autoIncrementPart}${checkPart}`)
    }
    const primaryKey = table.columns.filter((c) => c.isPrimaryKey)
    if (primaryKey.length > 0 && !rowid) {
      lines.push(`  PRIMARY KEY (${primaryKey.map((c) => quoteSqlName(c.name, dialect)).join(', ')})`)
    }
    for (const key of inlineKeys.filter(candidate => candidate.table.id === table.id)) lines.push('  ' + foreignKeyClause(key, dialect))
    const strict = sqlite && sqliteStrict(options.version) ? ' STRICT' : ''
    parts.push(`CREATE TABLE ${quoteSqlName(table.name, dialect)} (\n${lines.join(',\n')}\n)${strict};`)
  }

  // Clés étrangères après toutes les créations : plus de contrainte
  // d'ordre. Un groupe (une patte d'origine) = une contrainte.
  const alterStatements = sqlite ? [] : foreignConstraints(tables).map((key) =>
    'ALTER TABLE ' + quoteSqlName(key.table.name, dialect) + '\n  ADD ' + foreignKeyClause(key, dialect) + ';')
  if (alterStatements.length > 0) {
    parts.push(alterStatements.join('\n\n'))
  }

  return parts.join('\n\n')
}

/** Domaines PostgreSQL des types personnalisés utilisés, une fois chacun, dans l'ordre d'apparition. */
export function customDomains(tables: MpdTable[]): { name: string; sqlType: string; check?: CustomTypeCheck }[] {
  const seen = new Map<string, { name: string; sqlType: string; check?: CustomTypeCheck }>()
  for (const table of tables) for (const column of table.columns) {
    const custom = column.customType
    if (custom && !custom.unavailable && !seen.has(custom.id)) seen.set(custom.id, { name: custom.name, sqlType: column.sqlType, ...(custom.check ? { check: custom.check } : {}) })
  }
  return [...seen.values()]
}

/** CONSTRAINT nom FOREIGN KEY (...) REFERENCES cible (...), commun aux deux emplacements. */
function foreignKeyClause({ columns, targetName, name }: { columns: MpdColumn[]; targetName: string; name: string }, dialect: SqlDialect): string {
  const local = columns.map(c => quoteSqlName(c.name, dialect)).join(', ')
  const foreign = columns.map(c => quoteSqlName(c.references?.columnName ?? '', dialect)).join(', ')
  return 'CONSTRAINT ' + quoteSqlName(name, dialect) + ' FOREIGN KEY (' + local + ') REFERENCES ' + quoteSqlName(targetName, dialect) + ' (' + foreign + ')'
}

/** Les mêmes noms déterministes pour créer et retirer uniquement nos contraintes. */
export function foreignConstraints(tables: MpdTable[]): { table: MpdTable; columns: MpdColumn[]; targetName: string; name: string }[] {
  const constraints: { table: MpdTable; columns: MpdColumn[]; targetName: string; name: string }[] = []
  const usedConstraintNames = new Set<string>()
  for (const table of sortForCreation(tables)) {
    const groups = new Map<string, MpdColumn[]>()
    for (const column of table.columns) {
      if (column.references) {
        const group = groups.get(column.references.group)
        if (group) {
          group.push(column)
        } else {
          groups.set(column.references.group, [column])
        }
      }
    }
    for (const columns of groups.values()) {
      const first = columns[0]!
      const targetName = first.references?.tableName ?? ''
      let constraintName = `fk_${sanitizeSqlName(table.name)}_${sanitizeSqlName(targetName)}`.toLowerCase().slice(0, 60)
      let n = 2
      while (usedConstraintNames.has(constraintName)) {
        constraintName = `fk_${sanitizeSqlName(table.name)}_${sanitizeSqlName(targetName)}`.toLowerCase().slice(0, 55) + `_${n}`
        n += 1
      }
      usedConstraintNames.add(constraintName)
      constraints.push({ table, columns, targetName, name: constraintName })
    }
  }
  return constraints
}
