import type { AttributeType } from '../mcd'
import type { SqlDialect } from '../mpd'

/** Forme des paramètres qu'un type SQL accepte entre parenthèses. */
export type SqlTypeParameters =
  | { kind: 'none' }
  | { kind: 'length'; default: number; max: number }
  | { kind: 'precision'; maxPrecision: number; maxScale: number }
  | { kind: 'values' }

export type SqlTypeFamily = 'chaine' | 'entier' | 'decimal' | 'approche' | 'booleen' | 'temps' | 'document' | 'binaire' | 'identifiant' | 'reseau' | 'autre'

/**
 * Valeur par défaut calculée par le moteur, choisie dans une liste fermée.
 * Jamais un fragment SQL saisi : le document ne retient que `id`.
 */
export interface ColumnDefault {
  readonly id: string
  /** Écriture SQL exacte après DEFAULT, montrée telle quelle dans le sélecteur. */
  readonly sql: string
  readonly since?: string
}

/** Un type SQL réel d'un moteur. Pas de traduction ni de pseudo-type. */
export interface SqlTypeDefinition {
  readonly name: string
  /** Autres orthographes reconnues à la lecture, jamais écrites. */
  readonly aliases?: readonly string[]
  readonly family: SqlTypeFamily
  /** Type conceptuel déduit quand l'utilisateur choisit ce type au MPD. */
  readonly conceptual: AttributeType
  readonly parameters: SqlTypeParameters
  /** UNSIGNED accepté, entiers MySQL seulement. */
  readonly unsigned?: boolean
  /** Visible en mode débutant, et listé dans les types courants. */
  readonly common?: boolean
  /** Première version du moteur qui connaît ce type. Absent : toutes. */
  readonly since?: string
  /** Dernière version qui accepte ce type. Absent : aucune limite. */
  readonly until?: string
  readonly defaults?: readonly ColumnDefault[]
}

/**
 * Version proposée dans le sélecteur. Une version désigne sa dernière
 * révision : « 8.0 » satisfait un type apparu en 8.0.13.
 */
export interface EngineVersion {
  readonly id: string
  readonly label: string
  /** Encore maintenue par l'éditeur du moteur. */
  readonly supported: boolean
}

export interface EngineCatalog {
  readonly dialect: SqlDialect
  readonly label: string
  /** De la plus ancienne à la plus récente. */
  readonly versions: readonly EngineVersion[]
  /** Version d'un nouveau document, et des fichiers enregistrés sans version. */
  readonly defaultVersion: string
  /** Ordre d'affichage dans les sélecteurs. */
  readonly types: readonly SqlTypeDefinition[]
  /** Nom d'un autre moteur vers le nom équivalent de celui-ci. */
  readonly translations: Readonly<Record<string, string>>
  /** Type SQL proposé pour un type conceptuel, selon la version si elle compte. */
  propose(type: AttributeType, size: number | undefined, version?: string): string
}
