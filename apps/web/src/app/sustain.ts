import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { REPO, SPONSORS } from './site';

@Component({
  selector: 'app-sustain',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './sustain.html',
})
export class Sustain {
  readonly repo = REPO;
  readonly sponsors = SPONSORS;
}
