import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SourceLink } from './ui/source-link';

@Component({
  selector: 'app-manifesto',
  standalone: true,
  imports: [RouterLink, SourceLink],
  templateUrl: './manifesto.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Manifesto {}
