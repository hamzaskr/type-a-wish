# Backup and restore

Backup is a release-critical follow-up to the persistence slice. The planned format is
versioned, authenticated, and merge-based: stable IDs add new records, identical
records are skipped, and ambiguous changes are presented as conflicts rather than
silently discarded. Readable exports must always be explicit and warned about.
