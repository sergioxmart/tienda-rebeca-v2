# Migrations — TechStore

> **Última actualización: 2026-08-09**

## Baseline actual

El esquema de TechStore fue condensado en una única migración inicial:

- `001_initial_schema.sql`: tablas, índices, restricciones, triggers y
  semillas mínimas del sistema.

La base local fue reiniciada eliminando y recreando el schema `public`. Los
datos de negocio, usuarios, pedidos, temas, configuración y catálogo parten
vacíos; solo se conservan las semillas técnicas de categorías, atributos,
módulos de página y configuración predeterminada. Los archivos físicos de
`uploads/` no forman parte de PostgreSQL y no se borran con este proceso.

## Cómo se corre

```bash
# 1. Una vez por máquina: crear DB y rol
npm run db:setup

# 2. Aplicar el baseline (idempotente mediante _migrations)
npm run migrate
```

El runner de `core/scripts/migrate.js` lee `migrations/*.sql` en orden
lexicográfico, aplica los archivos que no estén registrados en `_migrations`
y ejecuta cada archivo dentro de una transacción.

## Regla para cambios futuros

El baseline ya representa la historia condensada y no debe editarse en una
base que lo tenga aplicado. Los cambios posteriores deben agregarse como una
nueva migración numerada (`002_*.sql`, `003_*.sql`, etc.). Si en el futuro se
vuelve a hacer squash, debe ser una operación coordinada con un reset o una
migración de reemplazo para no perder datos.

## Después de un reset

No se crea ningún administrador automáticamente porque el baseline no guarda
contraseñas. Crear el primer usuario con:

```bash
npm run create-admin -- <correo> <clave>
```

Las secuencias de `auth_users`, `customer_accounts` y `orders` quedan
reiniciadas para comenzar en `1`.
