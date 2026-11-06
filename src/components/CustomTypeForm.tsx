import { useEffect, useId, useRef, useState } from 'react'
import { t } from '../i18n/runtime'
import { useLanguage } from '../lib/useLanguage'
import { validateCustomType } from '../model/customTypes'
import type { CustomSqlType, CustomTypeCheck } from '../model/customTypes'
import { ATTRIBUTE_TYPES } from '../model/mcd'
import type { AttributeType } from '../model/mcd'
import { SQL_DIALECTS } from '../model/mpd'
import type { SqlDialect } from '../model/mpd'
import { buttonClass } from './ui/buttonClass'
import { dialogClass } from './ui/dialogClass'
import { Select } from './ui/Select'

type CheckKind = 'none' | 'values' | 'range'
interface Draft { name: string; description: string; conceptual: AttributeType; base: Record<SqlDialect, string>; check: CheckKind; values: string; min: string; max: string }

const field = 'min-h-9 w-full min-w-0 rounded-lg border border-line-strong bg-surface px-2 py-1 text-sm'
const label = 'flex min-w-0 flex-col gap-1 text-xs font-medium text-ink-soft'

function toDraft(type: CustomSqlType | null): Draft {
  const base = Object.fromEntries(SQL_DIALECTS.map(dialect => [dialect.id, type?.base[dialect.id] ?? ''])) as Record<SqlDialect, string>
  const check = type?.check
  return {
    name: type?.name ?? '', description: type?.description ?? '', conceptual: type?.conceptual ?? 'texte', base,
    check: check?.kind ?? 'none', values: check?.kind === 'values' ? check.values.join('\n') : '',
    min: check?.kind === 'range' && check.min !== undefined ? String(check.min) : '', max: check?.kind === 'range' && check.max !== undefined ? String(check.max) : '',
  }
}

function fromDraft(draft: Draft, id: string): CustomSqlType {
  const base: Partial<Record<SqlDialect, string>> = {}
  for (const dialect of SQL_DIALECTS) { const value = draft.base[dialect.id].trim(); if (value) base[dialect.id] = value }
  const bound = (value: string) => value.trim() === '' ? undefined : Number(value)
  const min = bound(draft.min), max = bound(draft.max)
  const check: CustomTypeCheck | undefined = draft.check === 'values' ? { kind: 'values', values: draft.values.split('\n').map(value => value.trim()).filter(Boolean) }
    : draft.check === 'range' ? { kind: 'range', ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) } : undefined
  return { id, name: draft.name.trim(), conceptual: draft.conceptual, base, ...(draft.description.trim() ? { description: draft.description.trim() } : {}), ...(check ? { check } : {}) }
}

interface CustomTypeFormProps {
  /** Type à modifier, ou null pour un nouveau type. */
  type: CustomSqlType | null
  others: readonly CustomSqlType[]
  onSave: (type: CustomSqlType) => void
  onCancel: () => void
}

/** Fenêtre d'édition d'un type personnalisé. Les erreurs s'affichent en texte, sous le titre, et prennent le focus. */
export function CustomTypeForm({ type, others, onSave, onCancel }: CustomTypeFormProps) {
  useLanguage()
  const dialogRef = useRef<HTMLDialogElement>(null), errorsRef = useRef<HTMLDivElement>(null)
  const titleId = useId(), prefix = useId()
  const [draft, setDraft] = useState(() => toDraft(type))
  const [errors, setErrors] = useState<string[]>([])
  useEffect(() => { const dialog = dialogRef.current; if (dialog && !dialog.open) dialog.showModal() }, [])
  useEffect(() => { if (errors.length) errorsRef.current?.focus() }, [errors])
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }))
  const save = () => {
    const candidate = fromDraft(draft, type?.id ?? crypto.randomUUID())
    const found = validateCustomType(candidate, others)
    if (found.length) { setErrors(found); return }
    onSave(candidate)
  }
  return <dialog ref={dialogRef} aria-labelledby={titleId} className={dialogClass('md')} onCancel={event => { event.preventDefault(); onCancel() }}>
    <form className="flex flex-col gap-4 p-6" onSubmit={event => { event.preventDefault(); save() }}>
      <h2 id={titleId} className="text-lg font-semibold tracking-tight">{type ? t('Modifier le type {0}', [type.name]) : t('Nouveau type personnalisé')}</h2>
      {errors.length > 0 && <div ref={errorsRef} tabIndex={-1} role="alert" className="rounded-lg border border-danger-strong p-3 text-sm text-danger">
        <ul className="list-disc space-y-1 pl-4">{errors.map(error => <li key={error}>{error}</li>)}</ul>
      </div>}
      <label className={label}>{t('Nom')}
        <input className={field + ' font-mono'} value={draft.name} required autoComplete="off" spellCheck={false} onChange={event => set('name', event.target.value)} aria-describedby={prefix + 'name'} />
        <span id={prefix + 'name'} className="font-normal">{t('Lettres minuscules, chiffres et _. Exemple : email.')}</span>
      </label>
      <label className={label}>{t('Description')}
        <input className={field} value={draft.description} onChange={event => set('description', event.target.value)} />
      </label>
      <label className={label}>{t('Type conceptuel')}
        <Select value={draft.conceptual} onValueChange={value => { const next = ATTRIBUTE_TYPES.find(known => known === value); if (next) set('conceptual', next) }} className={field + ' font-mono'}>
          {ATTRIBUTE_TYPES.map(known => <option key={known} value={known}>{known}</option>)}
        </Select>
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t('Type de base par moteur')}</legend>
        <p className="text-xs text-ink-soft">{t('Laissez vide un moteur où ce type ne sert pas.')}</p>
        {SQL_DIALECTS.map(dialect => <label key={dialect.id} className={label}>{dialect.label}
          <input className={field + ' font-mono'} value={draft.base[dialect.id]} placeholder={dialect.id === 'sqlite' ? 'TEXT' : 'VARCHAR(320)'} autoComplete="off" spellCheck={false}
            onChange={event => set('base', { ...draft.base, [dialect.id]: event.target.value })} />
        </label>)}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t('Contrôle')}</legend>
        <Select value={draft.check} aria-label={t('Type de contrôle')} onValueChange={value => { if (value === 'none' || value === 'values' || value === 'range') set('check', value) }} className={field}>
          <option value="none">{t('Aucun')}</option>
          <option value="values">{t('Liste de valeurs')}</option>
          <option value="range">{t('Intervalle numérique')}</option>
        </Select>
        {draft.check === 'values' && <label className={label}>{t('Une valeur par ligne')}
          <textarea className={field + ' font-mono'} rows={3} value={draft.values} onChange={event => set('values', event.target.value)} />
        </label>}
        {draft.check === 'range' && <div className="grid grid-cols-2 gap-2">
          <label className={label}>{t('Minimum')}<input className={field} type="number" step="any" value={draft.min} onChange={event => set('min', event.target.value)} /></label>
          <label className={label}>{t('Maximum')}<input className={field} type="number" step="any" value={draft.max} onChange={event => set('max', event.target.value)} /></label>
        </div>}
      </fieldset>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className={buttonClass({ variant: 'secondary' })}>{t('Annuler')}</button>
        <button type="submit" className={buttonClass({ variant: 'primary' })}>{t('Enregistrer')}</button>
      </div>
    </form>
  </dialog>
}
