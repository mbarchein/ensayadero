# 01 · Visión general

## Qué es

Aplicación web instalable (PWA) para que un grupo de teatro planifique sus
ensayos. Resuelve el problema de cuadrar agendas: cada persona indica cuándo
puede, y quien dirige programa los ensayos sobre las franjas en que coincide la
gente necesaria.

## Roles

Dos capas de rol **independientes**:

### Rol de plataforma (atributo de `User`)
- **USER** — usuario normal.
- **SUPERADMIN** — ve toda la estructura (grupos, miembros, usuarios), gestiona
  grupos y usuarios. **No** ve disponibilidades individuales (decisión D2). No
  recibe notificaciones de grupos salvo membresía propia.

### Rol de grupo (atributo de `Membership`, por grupo)
- **INSTRUCTOR** (UI: «Director/Directora») — planifica, crea/edita/cancela
  ensayos, invita y gestiona miembros del grupo, edita nombre/avatar del grupo.
- **ACTOR** (UI: «Actor/Actriz») — pinta su disponibilidad, ve y confirma
  asistencia a los ensayos a los que se le convoca.

La misma persona puede ser director en un grupo y actor en otro. Puede haber
varios directores por grupo.

## Glosario

| Término | Significado |
|---------|-------------|
| Grupo | Compañía/montaje. Tenant aislado (D4). |
| Disponibilidad | Franjas en que un usuario puede ensayar. **Global** por usuario (D1), no por grupo. |
| Ensayo / Sesión | Evento con título, escena, lugar, rango horario, participantes y estado. |
| Estado de sesión | `DRAFT` (Borrador), `CONFIRMED` (Programado), `CANCELLED` (Cancelado). |
| Participante | Usuario convocado a una sesión; `required` (obligatorio) u opcional; con respuesta PENDING/ACCEPTED/DECLINED. |
| Heatmap | Rejilla semanal del planner: intensidad = nº de personas disponibles por franja. |
| Código de grupo | Código corto reutilizable para unirse al grupo (enlace/QR/manual). |

## Recorrido típico

1. **Alta**: cualquiera entra con Google (registro abierto, decisión revisada
   D5'); o llega por enlace/código de invitación a un grupo.
2. **Crear grupo**: cualquier usuario crea un grupo y pasa a ser su director.
3. **Invitar**: el director comparte código/enlace/QR o invita por email (lote).
4. **Disponibilidad**: cada miembro pinta su disponibilidad semanal (autosave).
5. **Planificar**: el director abre el heatmap, filtra personas, arrastra una
   franja y crea el ensayo (obligatorios/opcionales), avisos si alguien
   obligatorio no tiene disponibilidad.
6. **Confirmar**: al confirmar la sesión, los convocados reciben push + email.
7. **Responder**: cada convocado marca «Voy / No puedo» (pestaña Próximos, Mi
   agenda o detalle de sesión).
8. **Cambios**: cambios de hora o lugar y cancelaciones re-notifican.

## Pantallas (rutas)

| Ruta | Pantalla |
|------|----------|
| `/login`, `/auth/callback` | Acceso (Google; password solo en dev) |
| `/` | Inicio: mis grupos (avatar+rol), pendientes, crear/unir grupo |
| `/availability` | Mi agenda: calendario de disponibilidad + ensayos superpuestos |
| `/upcoming` | Próximos ensayos (todos los grupos) + confirmación |
| `/notifications` | Avisos |
| `/profile` | Perfil: nombre, teléfono, pronombre, push, borrar cuenta |
| `/join`, `/join/:code` | Unirse a un grupo por código |
| `/g/:groupId` | Grupo: lista de ensayos + pestañas |
| `/g/:groupId/planner` | Heatmap y planificación (director) |
| `/g/:groupId/members` | Miembros + panel de invitación (director) |
| `/g/:groupId/sessions/:id` | Detalle de sesión |
| `/admin` | Panel superadmin (estructura) |
