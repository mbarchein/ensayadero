// Example group-name suggestions used as placeholders in the create wizard,
// one pool per group type so the hint matches the chosen activity.
import type { GroupType } from './types'
import { FAMOUS_PLAYS } from './plays'

const NAMES: Record<GroupType, string[]> = {
  THEATRE: FAMOUS_PLAYS,
  MUSIC: [
    'Los Vientos del Sur',
    'Coro de Cámara',
    'The Backbeats',
    'Quinteto Aurora',
    'Banda Municipal',
    'Eco y Marea',
    'Jazz del Puerto',
    'Orquesta Filarmónica',
    'Las Cuerdas Rotas',
    'Góspel Ciudad',
    'Ritmo Libre',
    'Sinfónica Joven',
  ],
  DANCE: [
    'El lago de los cisnes',
    'Compañía Aurora',
    'El cascanueces',
    'Bolero',
    'Flamenco Vivo',
    'Danza Contemporánea',
    'El amor brujo',
    'Giselle',
    'Pasos de Tango',
    'Ballet del Norte',
    'Cuerpo y Compás',
    'La consagración de la primavera',
  ],
  SPORTS: [
    'Los Invencibles',
    'Tiburones FC',
    'Águilas del Norte',
    'Club Halcones',
    'Furia Roja',
    'Los Titanes',
    'Dragones',
    'Panteras',
    'Rayos del Sur',
    'Toros del Valle',
    'Cóndores',
    'Leones de Plata',
  ],
  OTHER: [
    'Club de los martes',
    'Grupo Aurora',
    'Equipo Alfa',
    'Los Habituales',
    'Círculo Creativo',
    'Peña del Barrio',
    'Colectivo Norte',
    'La Cuadrilla',
    'Punto de Encuentro',
    'Los de Siempre',
  ],
}

export function randomGroupName(type: GroupType): string {
  const pool = NAMES[type] ?? NAMES.OTHER
  return pool[Math.floor(Math.random() * pool.length)]
}
