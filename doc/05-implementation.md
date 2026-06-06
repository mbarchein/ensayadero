# 05 · Implementación (frontend)

## Estructura de `app/src`

```
auth/          AuthContext (sesión + perfil + refreshProfile), LoginPage, AuthCallback
components/    Layout (bottom nav), ui.tsx (Button/Badge/Modal/Spinner/EmptyState)
features/
  groups/      HomePage, JoinPage, MembersPage, InvitePanel, EditGroupModal,
               GroupAvatar, useGroup
  availability/ AvailabilityPage, WeekGrid (rejilla genérica pintable)
  planner/     PlannerPage (heatmap), CreateSessionModal (crear/editar/cancelar)
  sessions/    SessionsPage (lista+pestañas), SessionDetailPage
  agenda/      UpcomingPage, ParticipationCard, useMyAgenda
  notifications/ NotificationsPage
  profile/     ProfilePage
  admin/       AdminPage (superadmin)
lib/           supabase, types, ranges, slots, push, roleLabel, dateLocale, plays
i18n/          index.ts + es.json/en.json
sw.ts          service worker (precache + runtime cache + Web Push)
```

Patrón de datos: `react-query` con claves por entidad (`['session', id]`,
`['my-agenda']`, `['group-members', gid]`…); mutaciones invalidan las claves
afectadas. Sin estado global propio.

## Lógica núcleo (testeada)

### `lib/ranges.ts`
Parseo/serialización de `tstzrange` de Postgres (`["2026… +00", …)`),
`overlaps`, `contains`, `subtract` (resta de ocupaciones). Tests en
`ranges.test.ts`.

### `lib/slots.ts`
Rejilla semanal: franjas de 30 min, 08:00–23:00 (`SLOT_MINUTES`,
`DAY_START_HOUR`, `SLOTS_PER_DAY`).
- `expandAvailability(av, ini, fin)` — materializa puntuales y recurrentes
  (RRULE) en una ventana, aplicando `exception_dates`.
- `weekGrid(avs, lunes)` — matriz `[día][slot]` de estado de un usuario.
- `heatmap(users, lunes)` — por celda: `available` (libres tras descontar
  `busy`, D1), `preferred`, `busy` (pintado pero ocupado por otra sesión).
- `fullCoverageRanges(grid, obligatorios, lunes)` — franjas contiguas donde
  coinciden todos los requeridos.
Tests en `slots.test.ts` (expansión rrule, descuento D1, cobertura).

### `WeekGrid.tsx`
Rejilla reutilizable (pintado o visualización). Pointer Events para ratón+táctil
(`touch-action: none`). El estado de «pintando» va en **ref** (no estado React)
porque el handler de `pointermove` corre síncrono tras `pointerdown` y un
`setState` aún no estaría aplicado (causaba pintar solo la primera celda).
`setPointerCapture` envuelto en try/catch. Franjas pasadas atenuadas y no
editables (`isPast`).

### Disponibilidad (`AvailabilityPage`)
- Pintar alterna disponible↔sin marcar (preferido retirado).
- **Autosave** con debounce 600 ms al soltar; un contador de ediciones
  re-guarda si llegan trazos durante un guardado en vuelo.
- Persistencia por semana: borra disponibilidad puntual que solapa la semana y
  reinserta los bloques pintados (rangos contiguos).
- **Copiar a N semanas** (modal) en vez de recurrencia.
- **Borrar semana**: puntuales fuera; recurrentes → añade los 7 días como
  excepción.
- Overlay de ensayos convocados sobre las franjas (grupo en negrita + nombre),
  borde por respuesta (verde/rojo/ámbar) e icono lucide.
- **Guard**: al quitar disponibilidad en franja con ensayo programado, modal con
  detalles del ensayo y opciones (solo lo seleccionado / toda la franja), con la
  hora inicio-fin de cada opción. El aviso corre al soltar el gesto.

### Planner (`PlannerPage` + `CreateSessionModal`)
- Heatmap semanal con chips de selección de personas; intensidad por % de
  disponibles; borde si 100% obligatorios.
- Arrastrar selecciona franjas consecutivas; el detalle muestra chips de
  disponibles/ocupados/no disponibles (chip propio resaltado «(tú)»).
- `CreateSessionModal` crea o edita: título por defecto «<grupo> d-M», escena,
  lugar, hora inicio + duración (derivada del arrastre), participantes
  obligatorio/opcional; avisos rojo/ámbar si fuera de disponibilidad; reconcilia
  participantes (alta/baja/upsert) al editar; cancelar (confirmada→CANCELLED con
  notificación, borrador→delete).
- Overlay de sesiones de la semana en el grid + lista editable. Botón Editar solo
  para el creador o el director. Apertura por enlace `?d=&edit=<id>`.

### Agenda (`useMyAgenda`, `UpcomingPage`, `ParticipationCard`)
- `useMyAgenda`: mis participaciones (no canceladas, no archivadas) con todos los
  participantes para el resumen; mutación `respond`. `tallyResponses` cuenta
  voy/no van/pendientes y total.
- Upcoming: lista futura ordenada, aviso de pendientes, confirmación inline,
  «ver en mi agenda» (lleva a la semana del ensayo).

### Sesión (`SessionDetailPage`)
Cabecera con avatar+nombre de grupo; participantes con **chip de rol** (con
género) y nota de **disponibilidad parcial** (horas en que sí puede) o sin
disponibilidad, calculada con `expandAvailability` ∩ rango. Acciones de director:
editar, confirmar, cancelar, eliminar borrador.

### Invitar (`InvitePanel`, `JoinPage`)
Código de grupo, enlace (Web Share API + copiar), QR (canvas), regenerar /
activar-desactivar, email en lote. `JoinPage` une por código; si no hay sesión,
guarda el código y reanuda tras login (`AuthCallback`).

## PWA (`sw.ts`, `vite.config.ts`)
- `injectManifest`: precache de assets, runtime `NetworkFirst` para `/rest/v1/`
  (lectura offline), navegación SPA con denylist `/auth/`.
- Web Push: `push` muestra notificación; `notificationclick` enfoca/abre la URL.
- `lib/push.ts` suscribe (VAPID) y guarda en `push_subscriptions`.

## i18n
`i18next` + detección de idioma, fallback `es`. Plurales (`_one/_other`).
`lib/roleLabel.ts` resuelve la etiqueta de rol según pronombre
(`roles.INSTRUCTOR_F`…). Fechas con locale dinámico (`lib/dateLocale.ts`).

## Tests
`vitest` sobre la lógica pura (`ranges`, `slots`): 17 casos. La UI se verificó
con Playwright durante el desarrollo (no en el repo).
