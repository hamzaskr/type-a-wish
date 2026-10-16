# Architecture

The UI is React + TypeScript with React Router. Domain records live in
`src/domain/types.ts`; the IndexedDB adapter is isolated in
`src/infrastructure/database.ts`. Components call repository functions passed from
the application shell rather than opening IndexedDB themselves.

The persistence schema is versioned through Dexie. Encryption, media, backups, and
migrations should remain infrastructure concerns.
