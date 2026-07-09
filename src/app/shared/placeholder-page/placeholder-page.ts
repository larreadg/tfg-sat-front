import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-placeholder-page',
  imports: [CardModule],
  templateUrl: './placeholder-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlaceholderPage {
  private readonly route = inject(ActivatedRoute);

  readonly title: string = this.route.snapshot.data['title'] ?? 'Página';
}
