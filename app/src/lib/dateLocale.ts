import { es, enUS } from 'date-fns/locale'
import i18n from '../i18n'

/** Locale de date-fns acorde al idioma activo de i18next. */
export const dateLocale = () => (i18n.language?.startsWith('en') ? enUS : es)
