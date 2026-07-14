export type Locale = 'en' | 'th'

export type DateVariant = 'short' | 'long' | 'iso' | 'relative' | 'noday'

export type DateInput = Date | string | number

export interface FormatOptions {
  locale?: Locale
  buddhistEra?: boolean
  separator?: string
  padDay?: boolean
  padMonth?: boolean
  showDay?: boolean
}

export interface ThaiFormatOptions {
  buddhistEra?: boolean
  shortMonth?: boolean
}

export interface LongFormatOptions {
  buddhistEra?: boolean
  shortMonth?: boolean
}

export interface DateConfig {
  buddhistEraOffset: number
  defaultLocale: Locale
  defaultSeparator: string
  days: Record<Locale, string[]>
  months: Record<Locale, { full: string[]; short: string[] }>
}