# PWA and storage limitations

The Vite PWA configuration caches only the application shell; private IndexedDB
records and media are not placed in service-worker caches. Browser storage is
quota-limited and not a backup. Static HTTPS hosting is sufficient for the shell.
