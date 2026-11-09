# Historias de usuario

- Como cliente, quiero crear un ticket con descripción, para solicitar ayuda. Aceptación: se exige asunto y descripción; se devuelve ID; otro cliente no puede verlo.
- Como supervisor, quiero asignar un técnico activo, para establecer responsabilidad. Aceptación: se conserva la asignación anterior; un cliente recibe 403.
- Como técnico, quiero registrar el trabajo y resolver un ticket asignado, para comunicar el resultado. Aceptación: solución obligatoria; fecha y actor quedan en historial; una asignación ajena se rechaza.
- Como administrador, quiero desactivar una cuenta, para retirar acceso. Aceptación: se revocan sesiones y se conserva historial; un supervisor no puede hacerlo.
- Como administrador, quiero registrar movimientos de inventario, para conocer existencias. Aceptación: cantidad positiva y saldo no negativo; operación y auditoría son atómicas.
- Como supervisor, quiero filtrar indicadores por fecha, para supervisar el servicio. Aceptación: periodo visible y estado vacío cuando no hay datos.
