import type { MpdTable } from './mpd'
import { t } from '../i18n/runtime'
import type { MpdSettings } from './mpd'
import { parseSqlType } from './sqlTypes'
import { usesMysqlSyntax } from './sqlCatalog'

/** DBAL ne distingue pas ces types MySQL à l'introspection sans configuration dédiée. */
export function doctrineCompatibilityWarnings(settings: MpdSettings, tables: MpdTable[]): string[] {
  const computed = tables.some(table => table.columns.some(column => column.defaultSql))
  const checked = tables.some(table => table.columns.some(column => column.customType?.check))
  const general = checked ? [t('Doctrine ne compare pas les contrôles CHECK des types personnalisés. Pour le parcours automatique, retirez le contrôle, ou utilisez la migration fournie par Meriz.')] : []
  if (computed) general.push(t('Doctrine ne compare pas les valeurs par défaut calculées, comme CURRENT_TIMESTAMP ou gen_random_uuid(). Pour le parcours automatique, retirez-les, ou utilisez la migration fournie par Meriz.'))
  if (!usesMysqlSyntax(settings.dialect)) return general
  const names = new Set(tables.flatMap(table => table.columns.map(column => column.sqlType)).map(raw => parseSqlType(raw)?.name))
  const warnings: string[] = []
  if (names.has('TINYINT')) warnings.push(t('TINYINT MySQL est relu comme BOOLEAN par Doctrine. Pour le parcours automatique, utilisez SMALLINT si sa plage convient, ou configurez un type Doctrine personnalisé.'))
  if (names.has('TIMESTAMP')) warnings.push(t('TIMESTAMP MySQL est comparé à DATETIME par Doctrine, ce qui peut produire des migrations répétées. Utilisez DATETIME si adapté, ou configurez un mappage Doctrine personnalisé.'))
  return [...general, ...warnings]
}
