import { useEffect, useId, useRef } from 'react'
import { t } from '../i18n/runtime'
import { useLanguage } from '../lib/useLanguage'
import type { TargetChangeColumn, TargetChangeImpact } from '../model/targetChange'
import { buttonClass } from './ui/buttonClass'
import { dialogClass } from './ui/dialogClass'

interface EngineChangeDialogProps {
  open: boolean
  /** Cible visée, par exemple « PostgreSQL 17 ». */
  target: string
  impact: TargetChangeImpact
  onConfirm: () => void
  onCancel: () => void
}

function ColumnList({ columns, unresolved }: { columns: TargetChangeColumn[]; unresolved: boolean }) {
  return <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-line bg-surface-soft p-2 font-mono text-xs">
    {columns.map(column => <li key={column.table + '.' + column.column}>
      {column.table}.{column.column} : {unresolved ? column.to : <>{column.from} <span aria-label={t('devient')}>→</span> {column.to}</>}
    </li>)}
  </ul>
}

/**
 * Bilan d'un changement de moteur ou de version, avant de l'appliquer.
 * Annuler garde le focus initial. Le changement reste annulable ensuite par Ctrl+Z.
 */
export function EngineChangeDialog({ open, target, impact, onConfirm, onCancel }: EngineChangeDialogProps) {
  useLanguage()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])
  return <dialog ref={dialogRef} aria-labelledby={titleId} className={dialogClass('md')}
    onCancel={event => { event.preventDefault(); onCancel() }}>
    <div className="p-6">
      <h2 id={titleId} className="text-lg font-semibold tracking-tight">{t('Passer à {0} ?', [target])}</h2>
      {impact.renamed.length > 0 && <section className="mt-4">
        <h3 className="text-sm font-medium">{t('Types adaptés : {0}', [String(impact.renamed.length)])}</h3>
        <p className="mt-1 text-sm text-ink-soft">{t('Ces colonnes prennent le nom équivalent du moteur choisi.')}</p>
        <ColumnList columns={impact.renamed} unresolved={false} />
      </section>}
      {impact.unresolved.length > 0 && <section className="mt-4">
        <h3 className="text-sm font-medium">{t('Décisions à prendre : {0}', [String(impact.unresolved.length)])}</h3>
        <p className="mt-1 text-sm text-ink-soft">{t('Ces types n’existent pas dans {0}. Choisissez un autre type avant l’export.', [target])}</p>
        <ColumnList columns={impact.unresolved} unresolved />
      </section>}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className={buttonClass({ variant: 'secondary' })}>{t('Annuler')}</button>
        <button type="button" onClick={onConfirm} className={buttonClass({ variant: 'primary' })}>{t('Changer de moteur')}</button>
      </div>
    </div>
  </dialog>
}
