const NO_VALUE = '—'

export function formatDate(value: string | null | undefined): string {
  if (!value) return NO_VALUE
  const d = new Date(value)
  if (isNaN(d.getTime())) return NO_VALUE
  return d.toLocaleDateString('th-TH', { dateStyle: 'medium' })
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return NO_VALUE
  const d = new Date(value)
  if (isNaN(d.getTime())) return NO_VALUE
  return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}
