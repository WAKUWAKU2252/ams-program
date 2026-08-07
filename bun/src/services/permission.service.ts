import { request } from './httpClient'

export const permissionService = {
  getPermissions(): Promise<string[]> {
    return request<string[]>('/permissions/me')
  },
}