import { quoteSqlName } from './sqlIdentifiers'
import { t } from "../i18n/runtime"
import type { CodeSchema } from './codeSchema'
import type { GeneratedFile } from './codegenTypes'
import { customDomains, foreignConstraints, mpdToSql, sortForCreation } from './mpd'
import { usesMysqlSyntax } from './sqlCatalog'
import type { SqlDialect } from './mpd'
import { phpString } from './php'

/**
 * Migration Doctrine : une classe `Version...` qui pose le schéma.
 *
 * Le SQL vient du MPD, donc du dialecte et des surcharges choisis dans
 * la vue MPD : il n'y a qu'un seul émetteur de SQL dans le projet.
 *
 * L'horodatage est figé. Doctrine ne s'en sert que comme identifiant de
 * version, donc une valeur fixe rend la génération déterministe ; l'avis
 * de la vue dit de renommer le fichier avant de l'ajouter à un projet
 * qui a déjà des migrations.
 */

export const DOCTRINE_MIGRATION_VERSION = '20250101000000'

/** Une instruction par bloc : `mpdToSql` les sépare par une ligne vide. */
function statements(sql: string): string[] {
  return sql
    .split(/\n{2,}/)
    .map((block) => block.trim().replace(/;$/, ''))
    .filter((block) => block !== '')
}

export function symfonyMigrationFile(schema: CodeSchema, dialect: SqlDialect, version?: string): GeneratedFile {
  const up = statements(mpdToSql(schema.physicalTables, dialect, { includeDrops: false, version }))
  // SQLite retire ses clés avec la table : pas d'ALTER TABLE.
  const down = [
    ...(dialect === 'sqlite' ? [] : foreignConstraints(schema.physicalTables)).map(({ table, name }) =>
      'ALTER TABLE ' + quoteSqlName(table.name, dialect) + (usesMysqlSyntax(dialect) ? ' DROP FOREIGN KEY ' : ' DROP CONSTRAINT ') + quoteSqlName(name, dialect)),
    ...sortForCreation(schema.physicalTables).reverse().map(table => 'DROP TABLE IF EXISTS ' + quoteSqlName(table.name, dialect)),
    ...(dialect === 'postgresql' ? customDomains(schema.physicalTables) : []).map(domain => 'DROP DOMAIN IF EXISTS ' + quoteSqlName(domain.name, dialect)),
  ]

  const toSql = (lines: string[]): string =>
    lines.map((line) => `        $this->addSql(${phpString(line)});`).join('\n')

  const content = t("<?php\n\ndeclare(strict_types=1);\n\nnamespace DoctrineMigrations;\n\nuse Doctrine\\DBAL\\Schema\\Schema;\nuse Doctrine\\Migrations\\AbstractMigration;\n\n/** Schéma initial, dérivé du MCD par Meriz. */\nfinal class Version{0} extends AbstractMigration\n{\n    public function getDescription(): string\n    {\n        return 'Schéma initial généré depuis le MCD par Meriz.';\n    }\n\n    public function up(Schema $schema): void\n    {\n{1}\n    }\n\n    public function down(Schema $schema): void\n    {\n{2}\n    }\n}\n", [DOCTRINE_MIGRATION_VERSION, toSql(up), toSql(down)])

  return { path: `migrations/Version${DOCTRINE_MIGRATION_VERSION}.php`, content }
}
