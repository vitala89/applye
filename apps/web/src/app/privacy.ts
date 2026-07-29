import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CONTACT_EMAIL } from './site';
import { SourceLink } from './ui/source-link';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [RouterLink, SourceLink],
  templateUrl: './privacy.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Privacy {
  readonly contactEmail = CONTACT_EMAIL;
}
