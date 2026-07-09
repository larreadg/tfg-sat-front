import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { ToastModule } from 'primeng/toast';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastModule],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App {
  private readonly titleService = inject(Title);

  constructor() {
    this.titleService.setTitle(environment.appName);
  }
}
