# 03 · Decisiones de diseño

Decisiones tomadas durante el diseño y la evolución. Formato ADR ligero. Las
revisadas se marcan con la versión vigente.

## Núcleo (acordadas al inicio)

### D1 — Disponibilidad global por usuario + ocupaciones cruzadas
La disponibilidad NO es por grupo: una sola agenda por persona
(`availabilities.user_id`, sin `group_id`). Una sesión **confirmada** en
cualquier grupo descuenta esa franja de la disponibilidad mostrada en los demás
grupos, **sin revelar** en qué grupo ni por qué.
- Por qué: refleja la realidad (la persona solo tiene una agenda), evita doble
  reserva entre grupos.
- Cómo: `group_busy_ranges()` (security definer) devuelve rangos ocupados por
  usuario sin exponer la sesión/grupo de origen; el heatmap los descuenta.

### D2 — Superadmin ve solo estructura
El superadmin ve grupos, miembros, roles, sesiones, invitaciones y estadísticas,
pero **nunca** disponibilidades individuales.
- Cómo: las políticas RLS de `availabilities` no incluyen bypass de superadmin.

### D3 — Rol por membresía + capa de plataforma
`INSTRUCTOR`/`ACTOR` viven en `Membership` (por grupo). `USER`/`SUPERADMIN` en
`User` (plataforma). Capas independientes; misma persona con roles distintos por
grupo; varios directores por grupo.

### D4 — Aislamiento total entre grupos
Miembros, sesiones, subgrupos y notificaciones de un grupo no cruzan a otro.
Único cruce: el descuento de disponibilidad de D1.

### D5 — Registro solo por invitación → **D5' Registro abierto**
- D5 (inicial): el alta requería invitación pendiente por email (gate en trigger
  `handle_new_user`).
- **D5' (vigente)**: al permitir que cualquiera cree grupos y unirse por código,
  el gate dejó de tener sentido. Registro **abierto** con Google; las
  invitaciones por email pendientes se autoaceptan al entrar. Migración
  `20260607000005`.

## Infraestructura

### D-stack — Supabase free tier (revisado de VPS)
Se evaluó VPS self-hosted (~5 €/mes) vs free tier. Elegido **free tier**:
Supabase (DB+Auth+RLS+Edge) + Cloudflare Pages + Resend + Web Push. Coste ~0 €.
Asumidas limitaciones (pausa por inactividad, 500MB).

### D-iac — Toda la infra con Terraform
`infra/` provisiona Supabase, Cloudflare Pages+DNS y secrets de GitHub. Pasos no
automatizables (OAuth client, tokens, dominio Resend, VAPID) en `BOOTSTRAP.md`.

### D-local — Stack local completo en docker-compose (sin Supabase CLI)
Postgres (imagen supabase con pg_cron/pg_net), GoTrue, PostgREST, gateway nginx
(emula Kong), Edge Function en Deno, runner de migraciones, frontend Vite.
Login por password solo en build de desarrollo.

## Producto / UX (evolución)

| Decisión | Resumen |
|----------|---------|
| D-create-open | Cualquier usuario crea **grupo** (pasa a director) y, al principio, ensayos. Luego revertido: **solo directores planifican** (`20260607000009`). |
| D-availability-read | Para que un miembro planificara se amplió la lectura de disponibilidad a co-miembros; con la reversión a solo-directores la lectura sigue siendo de co-miembros (necesaria para el heatmap del director). |
| D-archive | Archivado **por usuario** (oculta solo para ti) de sesiones canceladas/pasadas (`session_archives`). |
| D-join | Invitar fácil: **código de grupo** reutilizable (alfanumérico A-Z0-9 **sin I/O** para no confundir con 1/0), enlace `/join/:code`, QR y email en lote. Enlaces/códigos **abiertos** (quien los tenga entra); el director puede regenerar/desactivar. |
| D-copy | «Repetir cada semana» (recurrencia) sustituido por **copiar la semana a N semanas siguientes** (copia explícita, no RRULE). |
| D-preferred-out | Estado «preferido» retirado del pintado; solo disponible/sin marcar. |
| D-autosave | La disponibilidad se guarda con autosave (debounce 600 ms) al soltar el gesto, no con botón. |
| D-past | Franjas pasadas atenuadas y no editables; navegación atrás limitada a 6 semanas. |
| D-avatar | Avatar geométrico determinista por grupo (DiceBear «shapes»), con semilla `avatar_seed` regenerable por el director. |
| D-pronoun | Pronombre opcional (F/M) que solo adapta la etiqueta de rol (actriz/actor, directora/director). No se usa para nada más. |
| D-icons | Iconografía de acciones con `lucide-react`. |
| D-clear-guard | Quitar disponibilidad sobre un ensayo programado abre modal con detalles y opción de quitar solo lo seleccionado o toda la franja del ensayo. El aviso se ejecuta al **soltar** (no `confirm()` dentro del gesto, que se tragaba el `pointerup`). |
| D-notify-change | Las notificaciones distinguen cambio de hora / lugar / ambos; el cambio solo de lugar no reinicia respuestas. |
| D-term-programar | En la UI en español, «Planificar» → «Programar» (pestaña/título). El enum de estado `CONFIRMED` se muestra como «Programado». En inglés se mantiene «Plan»/«Scheduled». El código (rol `INSTRUCTOR`, RPCs, claves i18n `planner.*`) no cambia. |
| D-group-nav | La navegación del grupo dejó de ser pestañas tipo chip: **botones** «Programar» (CalendarPlus, solo director) y «Miembros» (Users). El chip «Ensayos» era redundante → título encima de la lista. |
| D-planner-bg | En el planner, las celdas con ensayo tienen **fondo** propio (violeta=programado, ámbar=borrador) además del borde izquierdo, para distinguirlas del color de disponibilidad. |
| D-invite-disabled | Al desactivar el código de invitación, se ocultan el código y todas las acciones (compartir/copiar/QR/email/regenerar); solo queda una nota y el botón de reactivar. |
| D-back-consistent | El enlace «back» va pegado al título dentro de `<header>` en todas las vistas (mismo espaciado). |
| D-promote-icons | Botón de cambiar rol con icono: `UserCog` (hacer director), `UserMinus` (pasar a actor). |

## Decisiones de modelado relevantes
- Rangos temporales como `tstzrange` + índices GiST; solapes con `&&`.
- Recurrencia de disponibilidad con RRULE + `exception_dates`, materializada al
  consultar (no al guardar).
- Estados de sesión como enum; transiciones disparan notificaciones por trigger.
