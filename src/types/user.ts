export interface Role {
  id: number
  name: string
  description: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface User {
  id: number
  username: string
  email: string
  displayName: string
  roleId: number
  employeeId: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  role: Role
}