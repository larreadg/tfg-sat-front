import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
    canActivate: [guestGuard]
  },
  {
    path: '',
    loadComponent: () => import('./layout/main-layout/main-layout').then((m) => m.MainLayout),
    canActivate: [authGuard],
    children: [
      { path: 'inicio', loadComponent: () => import('./features/inicio/inicio').then((m) => m.Inicio) },
      {
        path: 'reportes',
        loadComponent: () => import('./shared/placeholder-page/placeholder-page').then((m) => m.PlaceholderPage),
        data: { title: 'Reportes' }
      },
      {
        path: 'encuestas',
        loadComponent: () => import('./shared/placeholder-page/placeholder-page').then((m) => m.PlaceholderPage),
        data: { title: 'Encuestas' }
      },
      {
        path: 'analisis',
        loadComponent: () => import('./shared/placeholder-page/placeholder-page').then((m) => m.PlaceholderPage),
        data: { title: 'Análisis' }
      },
      {
        path: 'configuracion',
        loadComponent: () => import('./shared/placeholder-page/placeholder-page').then((m) => m.PlaceholderPage),
        data: { title: 'Configuración' }
      },
      { path: '', redirectTo: 'inicio', pathMatch: 'full' }
    ]
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' }
];
