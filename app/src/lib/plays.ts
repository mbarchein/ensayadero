// Titles of famous theatre plays, for group name placeholders.
export const FAMOUS_PLAYS = [
  'La vida es sueño',
  'Bodas de sangre',
  'La casa de Bernarda Alba',
  'Don Juan Tenorio',
  'Fuenteovejuna',
  'Luces de bohemia',
  'El alcalde de Zalamea',
  'La Celestina',
  'Hamlet',
  'Romeo y Julieta',
  'Macbeth',
  'El sueño de una noche de verano',
  'La tempestad',
  'Casa de muñecas',
  'El jardín de los cerezos',
  'La gaviota',
  'Esperando a Godot',
  'Un tranvía llamado deseo',
  'La cantante calva',
  'Tres sombreros de copa',
]

export function randomPlay(): string {
  return FAMOUS_PLAYS[Math.floor(Math.random() * FAMOUS_PLAYS.length)]
}
