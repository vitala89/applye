import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SourceLink } from './ui/source-link';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [RouterLink, SourceLink],
  templateUrl: './privacy.html',
})
export class Privacy {}
