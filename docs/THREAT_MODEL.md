# Threat model

The target is protection against casual device access and accidental exposure through
normal browser use. A future encrypted envelope must use authenticated encryption and
an independent recovery key before private records are described as encrypted at rest.

This app cannot protect data from a compromised device, malicious extensions, an
attacker executing JavaScript while unlocked, weak passcodes, or a user who exports
readable content. Clearing browser storage can destroy the local archive.
