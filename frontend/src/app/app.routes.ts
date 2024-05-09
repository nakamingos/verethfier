import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'verify/:data',
    loadComponent: () => import('./routes/verify/verify.component').then(m => m.VerifyComponent),

  }
];
