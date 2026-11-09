# Copias, retención y restauración

La copia de la base usa la API de backup de SQLite, compatible con WAL, y ejecuta `PRAGMA integrity_check` sobre el archivo resultante. Rechaza sobrescribir un destino existente y crea el archivo de forma exclusiva. La copia no cifra ni transmite los datos. La prueba `apps/api/src/backup.test.ts` crea una base WAL aislada, la copia, restaura en lectura, verifica integridad y comprueba que una escritura posterior no aparece en la copia.

## Crear una copia

Con `DATABASE_PATH` apuntando a la base y `BACKUP_PATH` a un archivo nuevo en almacenamiento restringido:

```sh
BACKUP_PATH=/ruta/segura/opsdesk-20261108T120000Z.db pnpm --filter @opsdesk/api db:backup
```

La fecha es un ejemplo; generar un nombre único UTC en la programación externa. La imagen de producción no incluye pnpm; con Compose se puede montar un directorio seguro, accesible para escritura por el usuario 1000 del contenedor:

```sh
docker compose run --rm -v /ruta/segura:/backup -e BACKUP_PATH=/backup/opsdesk-20261108T120000Z.db api node dist/backup.js
```

No copiar únicamente el archivo `.db` mientras hay escrituras WAL. Los adjuntos se respaldan por separado: para obtener un conjunto coherente, detener la aplicación o establecer un procedimiento de instantánea coordinada antes de copiar base y directorio de adjuntos. Guardar las copias cifradas y fuera del servidor.

## Retención

Política sugerida: mantener 14 copias diarias y verificar periódicamente la restauración. El planificador del sistema es externo; no hay backups programados automáticamente. El siguiente comando **solo simula** qué archivos del patrón `opsdesk-YYYYMMDDTHHMMSSZ.db` se retirarían:

```sh
node scripts/rotate-backups.mjs /ruta/segura 14
```

Después de revisar la salida y confirmar que la ruta es exclusiva de backups, añadir `--apply` para efectuar la rotación. Se ignoran otros nombres y enlaces simbólicos. Esto no rota ni elimina respaldos de adjuntos: coordinar su retención con la base correspondiente.

## Restaurar

1. Detener todos los procesos con acceso a la base y conservar el estado anterior de forma segura.
2. Trabajar primero en un entorno aislado: colocar la copia verificada como base, restaurar el conjunto de adjuntos correspondiente y mantener los permisos restrictivos.
3. Con todas las conexiones cerradas, retirar de la ubicación de restauración los archivos WAL/SHM de la base anterior; no mezclar WAL de una base con otra copia.
4. Iniciar la aplicación con la ruta restaurada, ejecutar `integrity_check`, consultar `/api/v1/ready`, autenticar una cuenta de prueba y verificar tickets y descargas autorizadas.
5. Registrar el resultado del ensayo, transferir el procedimiento al entorno real solo tras validarlo y conservar la copia anterior hasta confirmar recuperación.

Referencia: [SQLite Online Backup API](https://www.sqlite.org/backup.html).
