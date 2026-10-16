# Data model

Wishes, memories, and categories use stable random IDs and store relationships by ID.
A wish can reference many categories; a memory can reference many wishes. Deleting a
wish therefore does not require deleting memories.

Dexie schema version 1 indexes status, timestamps, category relationships, and memory
links for offline filtering.
