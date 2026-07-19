import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DATA_CONTRACT, REPO } from './site';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './privacy.html',
})
export class Privacy {
  readonly repo = REPO;
  readonly dataContract = DATA_CONTRACT;
}
