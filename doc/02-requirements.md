# 02 · Requisitos

Estado: ✅ implementado · 🟡 parcial · ⬜ pendiente.

## Funcionales

### Autenticación y acceso
- ✅ RF1. Login OAuth con Google (Auth.js/GoTrue). Otros providers preparados.
- 🟡 RF2. Invitación: por email, por **código de grupo** reutilizable, enlace y
  QR. *Nota:* el registro pasó a **abierto** (D5'), la invitación añade a un grupo.
- ✅ RF3. Rol por membresía (INSTRUCTOR/ACTOR); selector implícito por grupo.
- ✅ RF4. Un usuario en varios grupos, con rol distinto en cada uno.

### Disponibilidad
- ✅ RF5. Calendario semanal pintable (arrastrar; tap alterna).
- 🟡 RF6. Vista mensual resumen — no implementada; se navega por semanas.
- ✅ RF7. Recurrencia: sustituida por **copiar a N semanas** (D-copy). RRULE
  soportado en datos/expansión pero ya no se crea desde UI.
- ✅ RF8. Estados de disponibilidad: disponible / sin marcar. «Preferido»
  retirado de la UI (queda en datos, decisión revisada).
- ✅ RF9. Edición offline parcial vía PWA (lectura cacheada). Autosave al pintar.

### Planificación (director)
- ✅ RF10. Heatmap de disponibilidad del grupo (color = nº disponibles).
- ✅ RF11. Filtro por subconjunto de personas (chips). Subgrupos guardados:
  tabla existe, UI pendiente (⬜).
- 🟡 RF12. Sugerencia de franjas: `fullCoverageRanges()` existe en lib; sin UI
  dedicada (el heatmap ya resalta cobertura).
- ✅ RF13. Crear sesión: título, escena, lugar, hora inicio/fin (arrastre),
  obligatorio/opcional por persona.
- ✅ RF14. Aviso si la hora cae fuera de la disponibilidad de alguien
  obligatorio (rojo) u opcional (ámbar); confirmación.
- ✅ RF15. Estados borrador→programado→cancelado; cambio de hora re-notifica.

### Notificaciones
- ✅ RF16. Al confirmar/cancelar/cambiar: push in-app + email a afectados.
- ✅ RF17. Confirmar/rechazar asistencia (inline en varias vistas).
- 🟡 RF18. Recordatorios configurables: job `generate_reminders` (24h) creado;
  ventana 2h y preferencia de antelación no expuestas en UI.
- 🟡 RF19. Preferencias por canal: tabla `notification_preferences` + lógica en
  Edge Function; UI de preferencias pendiente (⬜).
- ✅ RF20. El director ve el estado de respuestas (pendiente/voy/no voy) y
  resumen agregado.

### No funcionales
- ✅ RNF1. PWA instalable (manifest, SW, precache, push).
- ✅ RNF2. Mobile-first (bottom nav, gestos táctiles, objetivos 44px).
- ✅ RNF3. i18n (es por defecto, en).
- ✅ RNF4. Zonas horarias: se guarda en UTC (`tstzrange`), se muestra en local.
- ✅ RNF5. GDPR: borrado de cuenta propio (cascada), datos mínimos.
- 🟡 RNF6. Accesibilidad: estados no dependen solo del color (iconos/bordes);
  auditoría WCAG completa pendiente.

## Requisitos derivados de decisiones posteriores

- ✅ RF21. Aislamiento total entre grupos (D4); único cruce: descuento de
  disponibilidad por sesiones confirmadas (sin revelar origen).
- ✅ RF22. Director promueve/degrada roles; varios directores posibles.
- ✅ RF23. Abandonar grupo (borra membresía propia).
- ✅ RF24. Inicio multi-grupo con avatar geométrico por grupo.
- ✅ RF25–29. Superadmin ve estructura, gestiona grupos/usuarios, auditoría
  (`audit_log`), bootstrap por SQL.
- ✅ RF30. Crear grupo cualquier usuario (pasa a director).
- ✅ RF31. Archivado **por usuario** de ensayos cancelados/pasados.
- ✅ RF32. Pronombre opcional → etiqueta de rol con género (actriz/actor…).
- ✅ RF33. Aviso al quitar disponibilidad en franja con ensayo programado, con
  opción de quitar solo lo seleccionado o toda la franja del ensayo.
