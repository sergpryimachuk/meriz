import { sanitizeSqlName } from './sql'
import { usesMysqlSyntax } from './sqlCatalog'
import type { SqlDialect } from './mpd'

/** Les noms comme « Order » restent utilisables sans devenir des mots-clés SQL. */
export function quoteSqlName(name: string, dialect: SqlDialect): string {
  const quote = usesMysqlSyntax(dialect) ? '`' : '"'
  return quote + sanitizeSqlName(name) + quote
}
