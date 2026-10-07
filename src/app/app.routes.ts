import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { permisoGuard } from './core/guards/permiso.guard';
import { permiso, RECURSO } from './core/models/permiso.model';

const placeholder = () =>
  import('./shared/placeholder-page/placeholder-page').then((m) => m.PlaceholderPage);

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
    canActivate: [guestGuard]
  },
  {
    path: 'reportar',
    loadComponent: () => import('./features/reportar/reportar').then((m) => m.Reportar)
  },
  {
    path: '',
    loadComponent: () => import('./layout/main-layout/main-layout').then((m) => m.MainLayout),
    canActivate: [authGuard],
    children: [
      {
        path: 'inicio',
        loadComponent: () => import('./features/inicio/inicio').then((m) => m.Inicio),
        data: { title: 'Inicio' }
      },
      {
        path: 'reportes',
        loadComponent: () => import('./features/reportes/reportes').then((m) => m.Reportes),
        canActivate: [permisoGuard(permiso(RECURSO.REPORTE, 'ver'))],
        data: { title: 'Reportes' }
      },
      {
        path: 'reportes/:id',
        loadComponent: () =>
          import('./features/reportes/reporte-detalle/reporte-detalle').then((m) => m.ReporteDetalle),
        canActivate: [permisoGuard(permiso(RECURSO.REPORTE, 'ver'))],
        data: {
          title: 'Detalle del reporte',
          breadcrumbPadre: { label: 'Reportes', routerLink: '/reportes' }
        }
      },
      {
        path: 'alertas',
        loadComponent: () => import('./features/alertas/alertas').then((m) => m.Alertas),
        canActivate: [permisoGuard(permiso(RECURSO.ALERTA, 'ver'))],
        data: { title: 'Alertas' }
      },
      {
        path: 'alertas/:id',
        loadComponent: () =>
          import('./features/alertas/alerta-detalle/alerta-detalle').then((m) => m.AlertaDetalle),
        canActivate: [permisoGuard(permiso(RECURSO.ALERTA, 'ver'))],
        // La hoja del breadcrumb la publica la pantalla con el código del
        // reporte de origen; `title` es el respaldo mientras carga.
        data: {
          title: 'Detalle de la alerta',
          breadcrumbPadre: { label: 'Alertas', routerLink: '/alertas' }
        }
      },
      {
        path: 'mapa',
        loadComponent: () => import('./features/mapa/mapa').then((m) => m.Mapa),
        canActivate: [permisoGuard(permiso(RECURSO.REPORTE, 'ver'))],
        data: { title: 'Mapa' }
      },
      {
        path: 'analisis',
        loadComponent: () => import('./features/analisis/analisis').then((m) => m.Analisis),
        canActivate: [permisoGuard(permiso(RECURSO.REPORTE, 'ver'))],
        data: { title: 'Análisis' }
      },
      {
        path: 'encuestas',
        loadComponent: () => import('./features/encuestas/encuestas').then((m) => m.Encuestas),
        canActivate: [permisoGuard(permiso(RECURSO.ENCUESTA, 'ver'))],
        data: { title: 'Encuestas' }
      },
      {
        path: 'webhooks',
        loadComponent: () => import('./features/webhooks/webhooks').then((m) => m.Webhooks),
        canActivate: [permisoGuard(permiso(RECURSO.WEBHOOK, 'ver'))],
        data: { title: 'Notificaciones' }
      },
      {
        path: 'zonas-riesgo',
        loadComponent: () => import('./features/zonas-riesgo/zonas-riesgo').then((m) => m.ZonasRiesgo),
        canActivate: [permisoGuard(permiso(RECURSO.ZONA_RIESGO, 'ver'))],
        data: { title: 'Zonas de riesgo' }
      },
      {
        path: 'auditoria',
        loadComponent: () => import('./features/auditoria/auditoria').then((m) => m.Auditoria),
        canActivate: [permisoGuard(permiso(RECURSO.AUDITORIA, 'ver'))],
        data: { title: 'Auditoría' }
      },
      {
        path: 'configuracion',
        loadComponent: () =>
          import('./features/configuracion/configuracion').then((m) => m.Configuracion),
        // Modo 'alguno': el módulo agrupa tabs con permisos distintos y cada uno se
        // filtra por su cuenta. Exigir los tres dejaría afuera, por ejemplo, a quien
        // solo administra usuarios.
        canActivate: [
          permisoGuard(
            [
              permiso(RECURSO.CONFIGURACION_CRITICIDAD, 'ver'),
              permiso(RECURSO.CONFIGURACION_SISTEMA, 'ver'),
              permiso(RECURSO.USUARIO, 'ver'),
              permiso(RECURSO.ROL, 'ver')
            ],
            'alguno'
          )
        ],
        data: { title: 'Configuración' }
      },
      { path: '', redirectTo: 'inicio', pathMatch: 'full' }
    ]
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' }
];
