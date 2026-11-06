import { useState } from 'react'
import { t } from '../i18n/runtime'
import { useLanguage } from '../lib/useLanguage'
import { checkSql, customRef, customTypeTemplates } from '../model/customTypes'
import type { CustomSqlType } from '../model/customTypes'
import { SQL_DIALECTS } from '../model/mpd'
import { sqlTypeNames } from '../model/sqlTypes'
import { ConfirmDialog } from './ConfirmDialog'
import { CustomTypeForm } from './CustomTypeForm'
import { useSqlTypes } from './sqlTypesContext'
import { Button } from './ui/Button'
import { Icon } from './ui/Icon'

const cell = 'border-b border-line px-3 py-2 align-top text-sm'
const head = 'border-b border-line bg-shell px-3 py-2 text-left text-xs font-medium text-ink-soft'

/** Onglet du dictionnaire : les types personnalisés du document. */
export function CustomTypesView() {
  useLanguage()
  const { settings, dispatch, readOnly } = useSqlTypes()
  const [editing, setEditing] = useState<CustomSqlType | 'new' | null>(null)
  const [deleting, setDeleting] = useState<CustomSqlType | null>(null)
  const types = Object.values(settings.customTypes ?? {}).sort((a, b) => a.name.localeCompare(b.name))
  const uses = (type: CustomSqlType) => Object.values(settings.overrides).filter(value => value === customRef(type.id)).length
  const save = (type: CustomSqlType) => { if (!readOnly) dispatch({ type: 'SET_CUSTOM_TYPE', customType: type }); setEditing(null) }
  const noNativeUuid = !sqlTypeNames(settings.dialect, settings.version).includes('UUID')
  const deletingUses = deleting ? uses(deleting) : 0
  return <div className="flex min-w-0 flex-col gap-3">
    <p className="max-w-prose text-xs leading-relaxed text-ink-soft">{t('Un type personnalisé se définit une fois et sert à plusieurs propriétés. PostgreSQL le crée comme domaine. Les autres moteurs recopient son type de base et son contrôle dans chaque colonne.')}</p>
    {noNativeUuid && <p className="max-w-prose rounded-lg border border-line bg-surface-soft p-2 text-xs leading-relaxed">{t('Ce moteur n’a pas de type UUID natif. Pour un UUID, créez un type sur BINARY(16) ou CHAR(36), ou sur TEXT sous SQLite.')}</p>}
    {!readOnly && <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={() => setEditing('new')}><Icon name="plus" size={15} />{t('Ajouter un type')}</Button>
      {customTypeTemplates().map(template => <Button key={template.name} size="sm" variant="ghost" disabled={types.some(type => type.name === template.name)}
        onClick={() => save({ ...template, id: crypto.randomUUID() })}>{t('Ajouter le modèle {0}', [template.name])}</Button>)}
    </div>}
    {types.length === 0 ? <p className="p-3 text-sm text-ink-soft">{t('Aucun type personnalisé.')}</p> :
    <div className="min-w-0 overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full min-w-[40rem] border-separate border-spacing-0">
        <caption className="sr-only">{t('Types personnalisés : nom, type conceptuel, type de base par moteur, contrôle et utilisations.')}</caption>
        <thead><tr>
          <th scope="col" className={head}>{t('Nom')}</th>
          <th scope="col" className={head}>{t('Type conceptuel')}</th>
          <th scope="col" className={head}>{t('Type de base')}</th>
          <th scope="col" className={head}>{t('Contrôle')}</th>
          <th scope="col" className={head}>{t('Utilisations')}</th>
          {!readOnly && <th scope="col" className={head}><span className="sr-only">{t('Actions')}</span></th>}
        </tr></thead>
        <tbody>{types.map(type => <tr key={type.id}>
          <th scope="row" className={cell + ' text-left font-normal'}>
            <span className="font-mono font-medium">{type.name}</span>
            {type.description && <span className="block text-xs text-ink-soft">{type.description}</span>}
          </th>
          <td className={cell + ' font-mono text-xs'}>{type.conceptual}</td>
          <td className={cell}><dl className="grid grid-cols-[auto_1fr] gap-x-2 text-xs">
            {SQL_DIALECTS.map(dialect => <div key={dialect.id} className="contents">
              <dt className={dialect.id === settings.dialect ? 'font-medium' : 'text-ink-soft'}>{dialect.label}</dt>
              <dd className="font-mono">{type.base[dialect.id] ?? <span className="text-ink-soft">{t('aucun')}</span>}</dd>
            </div>)}
          </dl></td>
          <td className={cell + ' font-mono text-xs'}>{type.check ? checkSql(type.check, 'VALUE') : '—'}</td>
          <td className={cell + ' text-xs'}>{uses(type)}</td>
          {!readOnly && <td className={cell}><div className="flex flex-wrap justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(type)} aria-label={t('Modifier le type {0}', [type.name])}>{t('Modifier')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setDeleting(type)} aria-label={t('Supprimer le type {0}', [type.name])}>{t('Supprimer')}</Button>
          </div></td>}
        </tr>)}</tbody>
      </table>
    </div>}
    {editing && <CustomTypeForm type={editing === 'new' ? null : editing} others={types} onSave={save} onCancel={() => setEditing(null)} />}
    <ConfirmDialog open={!!deleting} title={t('Supprimer le type « {0} » ?', [deleting?.name ?? ''])}
      message={deletingUses ? t('{0} propriété(s) reviennent au type proposé. Ctrl+Z permet d’annuler.', [String(deletingUses)]) : t('Aucune propriété ne l’utilise. Ctrl+Z permet d’annuler.')}
      confirmLabel={t('Supprimer')} onCancel={() => setDeleting(null)}
      onConfirm={() => { if (!readOnly && deleting) dispatch({ type: 'DELETE_CUSTOM_TYPE', id: deleting.id }); setDeleting(null) }} />
  </div>
}
