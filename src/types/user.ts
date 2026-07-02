export interface User {
  id: number;
  fullName: string;
  email: string;
  role: string;
  avatar?: string;
}

export const UserItem: User[] = [
  {
    id: 1125214,
    fullName: "Natdanai Sripol",
    email: "natdanai.sripol@example.com",
    role: "admin",
    avatar: "fi fi-sr-circle-user"
  },
]

