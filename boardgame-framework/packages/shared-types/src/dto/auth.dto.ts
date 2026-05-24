export interface RegisterRequest {
  username: string;
  password: string;
  email?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  userId: string;
  username: string;
  accessToken: string;
  expiresIn: number;
}

export interface UserSummary {
  userId: string;
  username: string;
}
