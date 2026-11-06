# Moteurs de base de données, versions et types personnalisés

Document de conception. Statut : validé, rien n'est codé.

## Le besoin

Aujourd'hui, le MPD connaît deux dialectes, `mysql` et `postgresql`, sans version. Le catalogue des types SQL est codé en dur dans `src/model/sqlTypes.ts`. MySQL n'a aucune solution pour un UUID. SQLite n'existe pas. On ne peut pas créer son propre type.

On veut :

1. Choisir un moteur et sa version : MySQL, MariaDB, PostgreSQL, SQLite.
2. Voir seulement les types réels de ce moteur, dans cette version.
3. Créer ses propres types, par exemple `uuid_id`, `email` ou `montant`, et les réutiliser.

## Ce qui ne change pas

- Le MCD garde ses sept types conceptuels. Aucun type SQL ne remonte dans le modèle conceptuel.
- UUID n'est pas un huitième type conceptuel. C'est un type physique, proposé seulement par les moteurs qui l'ont en natif. Au MCD, une propriété UUID reste un `texte`.
- Le moteur, la version, les surcharges et les types personnalisés vivent dans `MpdSettings`, comme aujourd'hui le dialecte.
- Les surcharges restent indexées par identifiant stable de propriété.

## 1. La cible : moteur et version

`MpdSettings` garde son champ `dialect`, qui nomme le moteur, et gagne un champ `version`.

```ts
export interface MpdSettings {
  dialect: SqlDialect   // 'mysql' | 'mariadb' | 'postgresql' | 'sqlite'
  /** Version du moteur. Absente : version par défaut du moteur. */
  version?: string
  overrides: Record<string, string>
  identity?: Record<string, boolean>
}
```

Ce choix, fait à l'étape 2, garde le format des fichiers et du document Yjs. Un ancien fichier reste valide tel quel. Une ancienne version de Meriz lit encore le moteur et ignore la version.

### Versions proposées

On ne liste que les versions où le catalogue ou la génération change. Chaque version porte un statut : maintenue ou en fin de vie. Une version en fin de vie reste choisissable, avec un avertissement.

| Moteur | Versions | Ce qui change |
|---|---|---|
| MySQL | 5.7, 8.0, 8.4 LTS, 9.x | 5.7 : CHECK ignoré, pas de défaut par expression. 8.0.13 : `DEFAULT (UUID_TO_BIN(UUID()))`. 8.0.16 : CHECK appliqué. 9.0 : `VECTOR`. |
| MariaDB | 10.6, 10.11 LTS, 11.4 LTS, 11.8 LTS, 12.3 | 10.6 : fin de support, pas d'UUID natif, INET6 présent. 10.7 : `UUID`. 10.10 : `INET4`. 11.7 : `VECTOR`, `UUID_v4()`, `UUID_v7()`. |
| PostgreSQL | 14, 15, 16, 17, 18 | Types stables. 18 : `uuidv7()` pour les défauts. Les multiranges existent depuis 14. |
| SQLite | 3.37+ STRICT, classique | STRICT limite les types à INT, INTEGER, REAL, TEXT, BLOB, ANY. Le mode classique accepte tout nom, avec affinité. |

Pour SQLite, la vraie différence n'est pas un numéro mais le mode STRICT. On l'expose comme deux « versions » : `3.37+ (STRICT)` et `classique`.

Défaut d'un nouveau document : MySQL 8.4. Un fichier sans version s'ouvre en MySQL 8.4 ou PostgreSQL 17. Une version inconnue retombe sur ce défaut. La règle vit dans `resolveVersion`.

## 2. Le catalogue des types, en données

Les tableaux `MYSQL_TYPES` et `POSTGRES_TYPES` et les fonctions `hasLength`, `hasPrecision`, `isIntegerType` deviennent un catalogue déclaratif, un fichier par moteur.

```ts
// src/model/sqlCatalog/types.ts
export type SqlTypeParameters =
  | { kind: 'none' }
  | { kind: 'length'; default: number; min: number; max: number }
  | { kind: 'precision'; precision: [min: number, max: number, def: number]; scale: [min: number, max: number, def: number] }
  | { kind: 'values' }            // ENUM, SET

export type SqlTypeFamily = 'chaine' | 'entier' | 'decimal' | 'approche' | 'booleen' | 'temps' | 'document' | 'binaire' | 'identifiant' | 'reseau' | 'autre'

export interface SqlTypeDefinition {
  name: string                    // nom SQL réel : 'VARCHAR', 'UUID'
  aliases?: string[]              // lus à l'import : 'BOOL', 'CHARACTER VARYING'
  family: SqlTypeFamily
  conceptual: AttributeType       // remplace conceptualTypeFor
  parameters: SqlTypeParameters
  unsigned?: boolean              // MySQL, entiers
  autoIncrement?: boolean
  common?: boolean                // visible en mode débutant
  since?: string                  // première version du moteur
  until?: string                  // dernière version, si retiré
  /** Phrase courte, affichée sous le sélecteur. Pédagogie. */
  hint: string
}

export interface EngineCatalog {
  engine: SqlEngine
  label: string
  versions: { id: string; label: string; supported: boolean }[]
  types: SqlTypeDefinition[]
  /** Type proposé pour chaque type conceptuel. */
  proposals: Record<AttributeType, (size?: number) => string>
}
```

Fichiers :

- `src/model/sqlCatalog/mysql.ts`
- `src/model/sqlCatalog/mariadb.ts` : part de la base MySQL et déclare ses écarts
- `src/model/sqlCatalog/postgresql.ts`
- `src/model/sqlCatalog/sqlite.ts`
- `src/model/sqlCatalog/index.ts` : `catalogFor`, `findSqlType`, `resolveVersion`, `availableIn`, `targetLabel`

`parseSqlType`, `formatSqlType` et `defaultSqlSpec` lisent la forme des paramètres dans le catalogue au lieu de listes codées en dur. `proposedSqlType` lit `proposals`. `sqlTypeForDialect` devient `translateType(spec, from, to)` et s'appuie sur une table de correspondances par famille.

`SqlTypeSpec.name` passe de l'union fermée `SqlTypeName` à `string`. La validité se vérifie contre le catalogue de la cible. C'est le prix d'un catalogue extensible. Les `switch` exhaustifs de `frameworkSqlTypes.ts` gagnent donc un cas `default` qui bloque l'export avec un message clair.

### Ajouts au catalogue

Sans exposer tout le moteur, on ajoute ce qui manque vraiment.

| Moteur | Ajouts |
|---|---|
| MySQL | BINARY, MEDIUMINT, MEDIUMTEXT, LONGTEXT, YEAR, SET, VECTOR (9.0+) |
| MariaDB | Comme MySQL, plus UUID (10.7+), INET6, INET4 (10.10+), VECTOR (11.7+). JSON y est un alias de LONGTEXT avec contrôle JSON_VALID, l'astuce le dit. |
| PostgreSQL | INET, CIDR, MACADDR, INTERVAL, TIME WITH TIME ZONE |
| SQLite | INTEGER, REAL, TEXT, BLOB, NUMERIC, ANY (STRICT seulement) |

### UUID

Règle retenue : UUID est un type du catalogue seulement là où le moteur l'a en natif.

| Moteur | UUID | Défaut proposé |
|---|---|---|
| PostgreSQL | `UUID` natif | `gen_random_uuid()`, ou `uuidv7()` en 18 |
| MariaDB 10.7+ | `UUID` natif | `(UUID_v4())` ou `(UUID_v7())` en 11.7+. `UUID()` n'est pas proposé : la documentation ne le montre pas en DEFAULT. |
| MariaDB 10.6 | absent | aucun |
| MySQL | absent | aucun |
| SQLite | absent | aucun |

Sans UUID natif, Meriz n'invente rien. L'utilisateur crée son propre type sur un type physique du moteur, par exemple `BINARY(16)` ou `CHAR(36)` sous MySQL. Voir la partie 4. L'astuce du sélecteur le dit en une phrase : « Ce moteur n'a pas de type UUID. Créez un type personnalisé sur BINARY(16) ou CHAR(36). »

Passer d'un moteur avec UUID à un moteur sans UUID suit la règle existante : décision explicite avant l'export.

Cela implique un champ nouveau : la valeur par défaut d'une colonne. Le défaut est une expression choisie dans une liste fermée par type natif, jamais un fragment SQL libre.

### Proposition par défaut pour SQLite

| Conceptuel | SQLite |
|---|---|
| texte | TEXT |
| entier | INTEGER |
| decimal | NUMERIC (classique) ou TEXT (STRICT, montant exact) |
| booleen | INTEGER, avec `CHECK (col IN (0,1))` |
| date, datetime, heure | TEXT au format ISO 8601 |

L'astuce sous le sélecteur explique pourquoi : SQLite n'a pas de type date ni booléen natif.

## 3. Génération SQL par moteur

`mpdToSql` contient déjà des branches par dialecte. On les sort dans une stratégie par moteur.

```ts
// src/model/sqlCatalog/generator.ts
export interface SqlGenerator {
  createTypes(customTypes: CustomSqlType[]): string[]   // CREATE DOMAIN, CREATE TYPE
  createTable(table: MpdTable, options: SqlOptions): string
  foreignKeys(tables: MpdTable[]): string[]              // ALTER TABLE, ou vide
  dropAll(tables: MpdTable[]): string[]
}
```

Le point dur est SQLite. SQLite ne sait pas ajouter une contrainte avec `ALTER TABLE`. Les clés étrangères vont donc dans le `CREATE TABLE`, et le script commence par `PRAGMA foreign_keys = ON;`. L'ordre topologique de `sortForCreation` devient alors obligatoire. Avec un cycle de références, les clés restent valides car SQLite ne vérifie une clé qu'à l'écriture. On le dit dans un commentaire du script.

Autres règles SQLite :

- Auto-incrément : `INTEGER PRIMARY KEY` seulement. Pas de `AUTOINCREMENT` sauf demande explicite.
- `STRICT` ajouté en fin de `CREATE TABLE` en mode STRICT.
- UNSIGNED, ENUM et la précision des décimaux n'existent pas. ENUM devient `TEXT` avec `CHECK (col IN (...))`, sur décision explicite comme aujourd'hui.

Les règles d'adaptation existantes restent : changer de moteur adapte les noms qui ont une correspondance. Un type sans correspondance demande une décision avant l'export.

### Exports Laravel et Symfony

MariaDB partage le générateur MySQL. Seuls changent le catalogue et quelques avertissements.

- Laravel supporte SQLite et MariaDB, avec le pilote `mariadb`. `uuid()` sert pour le type UUID natif. Un type personnalisé s'exporte avec l'appel de son type de base.
- Doctrine supporte SQLite et MariaDB. UUID natif se mappe vers `Types::GUID`.
- Les avertissements de `frameworkCompatibility.ts` deviennent des règles par cible, avec la version. Exemple : CHECK sous MySQL 5.7.

## 4. Types personnalisés

Un type personnalisé est un type physique nommé, défini une fois dans le document et réutilisé par plusieurs propriétés. Il suit l'esprit du dictionnaire : une définition, plusieurs références.

```ts
// src/model/sqlCatalog/customTypes.ts
export interface CustomSqlType {
  id: string
  name: string                    // identifiant SQL : 'email', 'uuid_id'
  description?: string
  conceptual: AttributeType       // garde le MCD cohérent
  /** Type de base par moteur. Absent = type inutilisable sur ce moteur. */
  base: Partial<Record<SqlEngine, string>>   // 'VARCHAR(320)', 'BINARY(16)', 'CHAR(36)'
  /** Contrainte optionnelle, sous forme fermée, jamais du SQL libre. */
  check?: { kind: 'values'; values: string[] } | { kind: 'range'; min?: number; max?: number }
}
```

`MpdSettings` gagne `customTypes: Record<string, CustomSqlType>`.

Une surcharge référence un type personnalisé par son identifiant, avec un préfixe : `overrides[propertyId] = 'custom:<id>'`. La valeur reste une chaîne, donc la carte Yjs `physical` ne change pas de forme. `buildMpd` résout le préfixe avant `parseSqlType`. Renommer le type ne casse aucune référence.

### Rendu SQL

| Moteur | Rendu |
|---|---|
| PostgreSQL | `CREATE DOMAIN email AS VARCHAR(320) CHECK (...)` en tête de script, y compris pour une liste de valeurs : un domaine accepte n'importe quel type de base. Les colonnes utilisent le nom du type. |
| MySQL, MariaDB | Le type de base est recopié dans la colonne, avec son CHECK (MySQL 8.0.16+, toutes les versions MariaDB listées). Une liste de valeurs devient `ENUM(...)`. |
| SQLite | Type de base recopié, CHECK recopié. |

Ce choix suit chaque moteur. PostgreSQL a de vrais domaines. MySQL et SQLite n'en ont pas, donc on déplie.

### Modèles fournis

Le contrôle de longueur minimale prévu au départ n'est pas livré. La valeur par défaut se choisit par colonne, d'après le type de base, et non dans le type. Le panneau propose deux modèles à ajouter en un clic. Rien n'est ajouté sans action de l'utilisateur. Pas de modèle UUID : l'utilisateur choisit lui-même le stockage sur les moteurs sans UUID natif.

- `email` : `VARCHAR(320)` partout, `TEXT` sous SQLite.
- `montant` : `DECIMAL(12,2)` ou `NUMERIC(12,2)`, CHECK `>= 0` optionnel.

### Validation

- Nom : identifiant SQL valide, unique dans le document, différent d'un type du catalogue.
- Base : doit être un type valide du catalogue de chaque moteur renseigné.
- Le type n'a pas de base pour le moteur choisi : même traitement qu'un type incompatible. Avertissement en texte et blocage de l'export.
- Supprimer un type utilisé : confirmation, puis les propriétés reviennent à la proposition par défaut.

## 5. Interface

### Sélecteur de moteur

Le sélecteur actuel de `DictionaryView.tsx` (« Moteur SQL ») devient deux contrôles côte à côte : moteur, puis version. La version se met à jour quand le moteur change. Il apparaît aussi dans l'en-tête de `MpdView` et de `SqlView`, pour ne pas avoir à revenir au dictionnaire.

Changer de moteur ou de version déclenche un bilan avant d'appliquer : « 3 colonnes changent de type, 1 demande une décision ». La liste est lisible au clavier et par lecteur d'écran. On peut annuler. L'action passe par l'historique Yjs, donc Ctrl+Z fonctionne.

### Sélecteur de type

`SqlTypeControl` garde sa structure :

- Groupes par famille, avec un libellé (`<optgroup>`).
- En mode débutant, seulement les types `common`.
- Un groupe « Mes types » en tête, avec les types personnalisés.
- Sous le sélecteur, l'astuce `hint` du type choisi.
- Un type indisponible dans cette version reste affiché avec la mention « Indisponible en MariaDB 10.6 ». Jamais seulement en couleur.

### Panneau « Types personnalisés »

Un nouvel onglet du dictionnaire, à côté de Tables, Associations et Non affectées. Un tableau : nom, description, une colonne par moteur pour la base, contrainte, nombre d'usages. Ajout, modification et suppression au clavier. Le formulaire d'édition est un dialogue avec focus piégé, comme les confirmations existantes.

Composants :

- `src/components/EngineSelect.tsx`
- `src/components/EngineChangeReview.tsx`
- `src/components/CustomTypesView.tsx`
- `src/components/CustomTypeForm.tsx`

## 6. Persistance et collaboration

- Fichier : `mpdSettings` gagne `version` et `customTypes`. `dialect` ne change pas.
- Yjs : la carte `physical` reçoit la clé `version`. Les types personnalisés vont dans une carte Yjs dédiée, une entrée par identifiant. Deux personnes qui créent un type en même temps ne s'écrasent pas.
- Une ancienne version de Meriz qui modifie le document efface la clé `version`. Le document retombe alors sur la version par défaut du moteur, sans erreur.
- Les types personnalisés restent propres au document. Pas de partage entre documents.

## 7. Lien avec la branche feat/docker

La branche apporte une image et un compose. Deux usages directs :

1. Une variable `MERIZ_DEFAULT_TARGET`, par exemple `postgresql@17`, lue par `40-meriz-config.sh` comme les autres marqueurs `__MERIZ_*__`. Un établissement fixe ainsi le moteur de ses cours. Valeur validée contre la liste des cibles, sinon défaut et message dans les journaux.
2. Un `compose.test.yaml` séparé avec MySQL 5.7, 8.0, 8.4, 9.x, MariaDB 10.6, 10.11, 11.4, 11.8 et PostgreSQL 14 à 18. Un script exécute le SQL généré à partir des modèles de test sur chaque cible. SQLite tourne sans conteneur. Aujourd'hui la vérification se fait à la main sous MySQL 8.4 et PostgreSQL 17. Ce compose ne fait pas partie de l'image publiée.

## 8. Découpage en étapes

Chaque étape se livre seule, avec ses tests.

1. **Catalogue en données.** Même contenu qu'aujourd'hui, nouveau format. Aucun changement visible. Les tests existants restent verts sans modification de leurs attentes.
2. **Moteur et version.** Champ `version`, lecture des anciens fichiers et du document Yjs, sélecteur de version, bilan de changement.
3. **Ajouts au catalogue et défauts de colonne.** Dont UUID natif PostgreSQL avec défaut.
4. **MariaDB.** Catalogue dérivé de MySQL, UUID natif selon la version, pilote Laravel `mariadb`.
5. **SQLite.** Livré : mode STRICT ou classique, clés étrangères dans le CREATE TABLE, SQL exécuté sous SQLite 3.54. Catalogue, générateur avec clés en ligne, exports Laravel et Doctrine.
6. **Types personnalisés.** Livré : modèle, onglet du dictionnaire, domaines PostgreSQL, contrôle recopié ailleurs, modèles email et montant.
7. **Docker.** `MERIZ_DEFAULT_TARGET` et `compose.test.yaml`.

## Décisions prises

1. UUID est un type physique, proposé seulement par les moteurs qui l'ont en natif : PostgreSQL, MariaDB 10.7+. Ailleurs, l'utilisateur crée son propre type sur un type physique du moteur.
2. MariaDB est un moteur à part entière.
3. Les versions retenues sont celles du tableau de la partie 1.
4. Les types personnalisés restent dans chaque document.
