import { useId } from 'react'
import { t } from '../i18n/runtime'
import { useLanguage } from '../lib/useLanguage'
import { SQL_DIALECTS } from '../model/mpd'
import type { SqlDialect } from '../model/mpd'
import { catalogFor, resolveVersion } from '../model/sqlCatalog'
import { Select } from './ui/Select'

interface EngineSelectProps {
  dialect: SqlDialect
  version: string | undefined
  disabled?: boolean
  /** Classes des deux déclencheurs, pour suivre la barre qui les accueille. */
  className?: string
  onChange: (dialect: SqlDialect, version: string) => void
}

/** Moteur SQL puis version. Changer de moteur prend la version par défaut du nouveau. */
export function EngineSelect({ dialect, version, disabled = false, className = '', onChange }: EngineSelectProps) {
  useLanguage()
  const engineId = useId(), versionId = useId()
  const catalog = catalogFor(dialect)
  const current = resolveVersion(dialect, version)
  const label = 'flex min-w-0 items-center gap-2 text-xs font-medium text-ink-soft'
  return <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
    <span className={label}>
      <label htmlFor={engineId}>{t('Moteur SQL')}</label>
      <Select id={engineId} disabled={disabled} value={dialect} className={className}
        onValueChange={value => { const next = SQL_DIALECTS.find(known => known.id === value); if (next) onChange(next.id, catalogFor(next.id).defaultVersion) }}>
        {SQL_DIALECTS.map(known => <option key={known.id} value={known.id}>{known.label}</option>)}
      </Select>
    </span>
    <span className={label}>
      <label htmlFor={versionId}>{t('Version')}</label>
      <Select id={versionId} disabled={disabled} value={current} className={className}
        onValueChange={value => { if (catalog.versions.some(known => known.id === value)) onChange(dialect, value) }}>
        {catalog.versions.map(known => <option key={known.id} value={known.id}>
          {known.supported ? known.label : t('{0} (fin de support)', [known.label])}
        </option>)}
      </Select>
    </span>
  </div>
}
