export interface UserEntity {
  userId: string;
  username: string;
  email: string | null;
  passwordHash: string;
  createdAt: Date;
}
