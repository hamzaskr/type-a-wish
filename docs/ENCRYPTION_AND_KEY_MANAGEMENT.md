# Encryption and key management

The current slice keeps the persistence boundary isolated so encryption can be added
without moving UI logic. It does **not** yet claim cryptographic protection for stored
records. Before release, implement and test AES-256-GCM envelopes with unique nonces,
a strong password KDF, a separately generated recovery key, authenticated metadata,
passcode re-wrapping, and lock-time memory cleanup.
