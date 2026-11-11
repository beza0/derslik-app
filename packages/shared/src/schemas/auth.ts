import { z } from 'zod';
import { TimeZone } from './common';

export const Password = z.string().min(10, 'Parola en az 10 karakter olmalı').max(200);

export const RegisterInput = z.object({
  email: z.email().max(254),
  password: Password,
  name: z.string().trim().min(1).max(100),
  /** Öğretmen kendi çalışma alanını açar; "member" öğrenci/veli hesabıdır (davetle bağlanır). */
  role: z.enum(['teacher', 'member']).default('teacher'),
  timezone: TimeZone.optional(),
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const LoginInput = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const RequestPasswordResetInput = z.object({ email: z.email().max(254) });
export const ResetPasswordInput = z.object({
  token: z.string().min(10).max(200),
  password: Password,
});
export const VerifyEmailInput = z.object({ token: z.string().min(10).max(200) });
export const RefreshInput = z.object({ refreshToken: z.string().min(10).max(300).optional() });

export const UpdateProfileInput = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  timezone: TimeZone.optional(),
});

export interface MeResponse {
  user: { id: string; email: string; name: string; emailVerified: boolean; isAdmin: boolean };
  contexts: {
    teacher: { workspaceId: string; timezone: string } | null;
    studentLinks: { studentId: string; workspaceId: string; teacherName: string }[];
    guardianLinks: { studentId: string; workspaceId: string; studentName: string; teacherName: string }[];
    admin: boolean;
  };
}

export interface AuthTokens {
  accessToken: string;
  accessTokenExpiresAt: string;
  /** Yalnızca mobil istemcilere gövdede döner; web'de HttpOnly çerezdedir. */
  refreshToken?: string;
}
