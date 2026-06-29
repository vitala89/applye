import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { REPO } from './site';

@Component({
  selector: 'app-blog',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './blog.html',
})
export class Blog {
  readonly repo = REPO;
}
