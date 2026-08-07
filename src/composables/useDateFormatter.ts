import { DATE_CONFIG } from '@/config/Dateconfig.ts'
import type {
  DateInput,
  FormatOptions,
  ThaiFormatOptions,
  LongFormatOptions,
  Locale,
} from '@/types/date.types'

const cfg = DATE_CONFIG

const toDate = (value: DateInput): Date | null => {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

const pad = (n: number, length = 2): string => String(n).padStart(length, '0')

const toBuddhistEra = (year: number): number => year + cfg.buddhistEraOffset

export function useDateFormatter() {
  const formatDate = (
    date: DateInput = new Date(),
    options: FormatOptions = {},
  ): string => {
    const {
      locale      = cfg.defaultLocale as Locale,
      buddhistEra = true,
      separator   = cfg.defaultSeparator,
      padDay      = false,
      padMonth    = false,
      showDay     = true,
    } = options

    const d = toDate(date)
    if (!d) return ''

    const dayName = locale === 'th'
      ? `วัน${cfg.days.th[d.getDay()]}`
      : cfg.days.en[d.getDay()]

    const dd = padDay   ? pad(d.getDate())      : d.getDate()
    const mm = padMonth ? pad(d.getMonth() + 1) : d.getMonth() + 1
    const yy = buddhistEra ? toBuddhistEra(d.getFullYear()) : d.getFullYear()

    const dateStr = [dd, mm, yy].join(separator)

    return showDay ? `${dayName} ${dateStr}` : dateStr
  }

  /**
   * Thai long → "วันศุกร์ที่ 26 มิถุนายน 2569"
   */
  const formatThai = (
    date: DateInput = new Date(),
    options: ThaiFormatOptions = {},
  ): string => {
    const { buddhistEra = true, shortMonth = false } = options

    const d = toDate(date)
    if (!d) return ''

    const dayName = `วัน${cfg.days.th[d.getDay()]}`
    const month   = shortMonth
      ? cfg.months.th.short[d.getMonth()]
      : cfg.months.th.full[d.getMonth()]
    const year    = buddhistEra ? toBuddhistEra(d.getFullYear()) : d.getFullYear()

    return `${dayName}ที่ ${d.getDate()} ${month} ${year}`
  }

  /**
   * EN long → "Friday, 26 June 2026"
   */
  const formatLong = (
    date: DateInput = new Date(),
    options: LongFormatOptions = {},
  ): string => {
    const { buddhistEra = false, shortMonth = false } = options

    const d = toDate(date)
    if (!d) return ''

    const dayName = cfg.days.en[d.getDay()]
    const month   = shortMonth
      ? cfg.months.en.short[d.getMonth()]
      : cfg.months.en.full[d.getMonth()]
    const year    = buddhistEra ? toBuddhistEra(d.getFullYear()) : d.getFullYear()

    return `${dayName}, ${d.getDate()} ${month} ${year}`
  }

  /**
   * ISO → "2569-06-26"
   */
  const formatISO = (
    date: DateInput = new Date(),
    buddhistEra = true,
  ): string => {
    const d = toDate(date)
    if (!d) return ''

    const year  = buddhistEra ? toBuddhistEra(d.getFullYear()) : d.getFullYear()
    const month = pad(d.getMonth() + 1)
    const day   = pad(d.getDate())

    return `${year}-${month}-${day}`
  }

  const formatRelative = (
    date: DateInput,
    locale: Locale = cfg.defaultLocale as Locale,
  ): string => {
    const d = toDate(date)
    if (!d) return ''

    const diffMs   = Date.now() - d.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHrs  = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (locale === 'th') {
      if (diffMins < 1)   return 'เมื่อกี้'
      if (diffHrs  < 1)   return `${diffMins} นาทีที่แล้ว`
      if (diffDays < 1)   return `${diffHrs} ชั่วโมงที่แล้ว`
      if (diffDays === 1) return 'เมื่อวาน'
      if (diffDays < 7)   return `${diffDays} วันที่แล้ว`
      return formatDate(date, { locale: 'th' })
    }

    if (diffMins < 1)   return 'just now'
    if (diffHrs  < 1)   return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`
    if (diffDays < 1)   return `${diffHrs} hr${diffHrs > 1 ? 's' : ''} ago`
    if (diffDays === 1) return 'yesterday'
    if (diffDays < 7)   return `${diffDays} days ago`
    return formatDate(date, { locale: 'en', buddhistEra: false })
  }

  return {
    formatDate,
    formatThai,
    formatLong,
    formatISO,
    formatRelative,
    // expose utilities ถ้าต้องการใช้ตรงๆ
    toBuddhistEra,
    toDate,
  }
}