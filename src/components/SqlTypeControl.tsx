import { Select } from './ui/Select'
import { useEffect, useState } from 'react'
import type { Property } from '../model/mcd'
import { defaultsFor } from '../model/sqlCatalog'
import { acceptsUnsigned, defaultSqlSpec, formatSqlType, hasLength, hasPrecision, hasValues, isCommonType, maxLength, parseSqlType, precisionLimits, sqlTypeForDialect, sqlTypeNames } from '../model/sqlTypes'
import type { SqlTypeSpec } from '../model/sqlTypes'
import { useSqlTypes } from './sqlTypesContext'
import { t } from '../i18n/runtime'
import { useLanguage } from '../lib/useLanguage'

type ControlPart = 'all' | 'type' | 'parameters'

/** Les cellules du dictionnaire réutilisent les mêmes validations que l'inspecteur. */
export function SqlTypeControl({ property, compact = false, part = 'all' }: {
  property: Pick<Property, 'id' | 'name' | 'type' | 'size'>; compact?: boolean; part?: ControlPart
}) {
  useLanguage()
  const field = (part === 'all' ? 'min-w-0 max-w-full rounded-control' : 'min-h-8 min-w-0 max-w-full rounded-lg') + ' border border-line-strong bg-surface px-2 py-1 font-mono text-xs'
  const { settings, dispatch, readOnly, physicalType, beginner } = useSqlTypes()
  const raw = physicalType(property.id, property.type, property.size)
  const spec = parseSqlType(raw)
  const [draft, setDraft] = useState({ length: '', precision: '', scale: '', values: '' })
  const [error, setError] = useState('')
  useEffect(() => {
    const value = parseSqlType(raw)
    setDraft({ length: String(value?.length ?? ''), precision: String(value?.precision ?? ''), scale: String(value?.scale ?? ''), values: value?.values?.join('\n') ?? '' })
    setError('')
  }, [raw])
  const apply = (value: SqlTypeSpec) => {
    if (readOnly) return
    const sql = formatSqlType(value)
    if (!parseSqlType(sql) || !sqlTypeForDialect(value, settings.dialect, settings.version)) { setError(t('Paramètres SQL invalides.')); return }
    setError(''); dispatch({ type: 'SET_SQL_TYPE', propertyId: property.id, value: sql })
  }
  const number = (key: 'length' | 'precision' | 'scale', label: string, min: number, max: number) =>
    <label className={part === 'parameters' ? 'flex min-w-0 items-center gap-1 text-xs text-ink-soft' : 'flex min-w-0 flex-col gap-1 text-xs text-ink-soft'}>
      <span>{label}</span>
      <input className={field + (part === 'parameters' ? ' w-16' : ' w-24')} type="number" min={min} max={max}
        disabled={readOnly} value={draft[key]} aria-label={label + ' — ' + property.name} aria-invalid={!!error}
        onChange={event => setDraft(value => ({ ...value, [key]: event.target.value }))}
        onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
        onBlur={() => { if (spec) apply({ ...spec, [key]: draft[key].trim() ? Number(draft[key]) : -1 }) }} />
    </label>
  const unsigned = !beginner && spec && acceptsUnsigned(spec.name, settings.dialect)
  const defaultOptions = spec ? defaultsFor(settings.dialect, settings.version, spec.name) : []
  const chosenDefault = settings.defaults?.[property.id]
  const unavailableDefault = chosenDefault !== undefined && !defaultOptions.some(option => option.id === chosenDefault)
  const showDefault = !beginner && (defaultOptions.length > 0 || chosenDefault !== undefined)
  const parameters = spec && (hasLength(spec.name) || hasPrecision(spec.name) || hasValues(spec.name) || unsigned || showDefault)
  return <div className={part === 'all' ? 'flex min-w-0 flex-col gap-2' : 'flex min-w-0 flex-col gap-1'} data-sql-type={property.id} data-sql-part={part}>
    {part !== 'parameters' && <div className={part === 'all' ? 'flex min-w-0 flex-wrap items-center gap-2' : 'flex min-w-0 flex-wrap items-center gap-1'}>
      <Select value={spec?.name ?? raw} disabled={readOnly} aria-label={t('Type de la propriété {0}', [property.name])} className={field + (part === 'all' ? ' flex-1' : ' w-full')}
        onValueChange={value => { const name = sqlTypeNames(settings.dialect, settings.version).find(n => n === value); if (name) apply(defaultSqlSpec(name)) }}>
        {(!spec || !sqlTypeNames(settings.dialect, settings.version).includes(spec.name) || (beginner && !isCommonType(spec.name))) && <option value={spec?.name ?? raw}>{raw}</option>}
        {(beginner ? [true] : [true, false]).map(common => <optgroup key={String(common)} label={common ? t('Types courants') : t('Types complémentaires')}>
          {sqlTypeNames(settings.dialect, settings.version).filter(name => isCommonType(name) === common).map(name => <option key={name} value={name}>{name}</option>)}
        </optgroup>)}
      </Select>
      {part === 'all' && !compact && raw !== spec?.name && <code className="min-w-0 basis-full break-all text-xs text-ink-soft">{raw}</code>}
    </div>}
    {part !== 'type' && <div className={part === 'all' ? 'flex min-w-0 flex-wrap gap-2' : 'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1'}>
      {spec && hasLength(spec.name) && number('length', t('Longueur'), 1, maxLength(spec.name))}
      {spec && hasPrecision(spec.name) && <>{number('precision', t('Précision'), 1, precisionLimits(spec.name, settings.dialect).precision)}{number('scale', t('Décimales'), 0, precisionLimits(spec.name, settings.dialect).scale)}</>}
      {unsigned && <label className={part === 'all' ? 'flex items-center gap-2 text-xs' : 'inline-flex min-h-8 items-center gap-1.5 text-xs'}><input type="checkbox" checked={!!spec.unsigned} disabled={readOnly} onChange={e => apply({ ...spec, unsigned: e.target.checked || undefined })} />UNSIGNED</label>}
      {spec && hasValues(spec.name) && <label className="flex w-full min-w-0 flex-col gap-1 text-xs text-ink-soft">{t('Une valeur par ligne')}<textarea className={field + ' w-full'} rows={part === 'all' ? 3 : 2} disabled={readOnly} value={draft.values} onChange={e => setDraft(d => ({ ...d, values: e.target.value }))} onBlur={() => apply({ ...spec, values: draft.values.split('\n') })} /></label>}
      {showDefault && <label className={part === 'parameters' ? 'flex min-w-0 items-center gap-1 text-xs text-ink-soft' : 'flex min-w-0 flex-col gap-1 text-xs text-ink-soft'}>
        <span>{t('Valeur par défaut')}</span>
        <Select value={chosenDefault ?? ''} disabled={readOnly} aria-label={t('Valeur par défaut de {0}', [property.name])} className={field}
          onValueChange={value => { if (!readOnly) dispatch({ type: 'SET_COLUMN_DEFAULT', propertyId: property.id, value: value === '' ? null : value }) }}>
          <option value="">{t('Aucune')}</option>
          {unavailableDefault && <option value={chosenDefault}>{chosenDefault}</option>}
          {defaultOptions.map(option => <option key={option.id} value={option.id}>{option.sql}</option>)}
        </Select>
      </label>}
      {!parameters && part === 'parameters' && <span className="text-xs text-ink-soft" aria-label={t('Aucun paramètre')}>—</span>}
    </div>}
    {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    {showDefault && unavailableDefault && <p className="text-xs text-warning">{t('Valeur par défaut indisponible dans ce moteur ou cette version.')}</p>}
    {part !== 'parameters' && (!spec || !sqlTypeNames(settings.dialect, settings.version).includes(spec.name)) && <p className="text-xs text-warning">{t('Type à vérifier pour le moteur choisi.')}</p>}
  </div>
}
