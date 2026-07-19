import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { REPO } from './site';

@Component({
  selector: 'app-manifesto',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './manifesto.html',
})
export class Manifesto {
  readonly repo = REPO;
}
