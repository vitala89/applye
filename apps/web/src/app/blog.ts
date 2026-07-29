import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SourceLink } from './ui/source-link';

@Component({
  selector: 'app-blog',
  standalone: true,
  imports: [RouterLink, SourceLink],
  templateUrl: './blog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Blog {}
