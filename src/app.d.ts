declare global {
  namespace App {
    interface Locals {
      user: {
        id: string;
        email: string;
        role: 'admin' | 'reviewer';
      } | null;
      sessionId: string | null;
    }
  }
}

export {};
