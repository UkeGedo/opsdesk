# ADR 0002: sesiones de servidor

Estado: propuesto, pendiente de implementación. Preferir sesiones revocables a tokens persistentes en almacenamiento del navegador. Cookies seguras y CSRF son requisitos; la autorización por recurso se ejecuta en servidor. Antes de entregar autenticación se validarán expiración, rotación, revocación y pruebas negativas.
