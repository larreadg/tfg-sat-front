import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-inicio',
  imports: [RouterLink, CardModule],
  templateUrl: './inicio.html',
  styleUrl: './inicio.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Inicio {}
