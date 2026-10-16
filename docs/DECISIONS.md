# Decisions

- IndexedDB is the source of truth; React state is a view cache.
- Preset categories are seeded once and referenced by stable IDs.
- The paper-and-ink palette is the default; expressive surfaces are reserved for
  categories and wish cards.
- External font requests are avoided so the shell remains offline-safe.
- Cryptography and backup stay behind infrastructure boundaries and must be
  implemented and tested before being called production-ready.
