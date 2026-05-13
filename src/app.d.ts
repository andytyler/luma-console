declare global {
  namespace App {
    interface Locals {
      user: {
        id: string;
        email: string;
        role: 'admin' | 'reviewer';
        name?: string | null;
        avatar_url?: string | null;
      } | null;
      sessionId: string | null;
    }
  }
}

export {};
