import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SPONSORS } from './site';
import { SourceLink } from './ui/source-link';

@Component({
  selector: 'app-sustain',
  standalone: true,
  imports: [RouterLink, SourceLink],
  templateUrl: './sustain.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sustain {
  readonly sponsors = SPONSORS;
}
