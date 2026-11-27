import type { Href } from 'expo-router';
import type { Role } from '@/types';

/** Menentukan rute beranda default berdasarkan role pengguna. */
export function getHomeRouteForRole(role: Role): Href {
  switch (role) {
    case 'asisten':
      return '/asisten';
    case 'aslab':
      return '/aslab' as Href;
    case 'praktikan':
      return '/praktikan/jadwal';
  }
}
