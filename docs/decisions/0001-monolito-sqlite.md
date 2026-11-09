# ADR 0001: monolito modular y SQLite

Estado: aceptado para una organización y una instancia. Un proceso API con módulos por dominio reduce complejidad operativa y facilita transacciones; SQLite con WAL y restricciones evita un servicio adicional. Se revisará al observar contención de escritura, necesidades de alta disponibilidad o multiinstancia. No implica que SQLite cubra cualquier escala.
