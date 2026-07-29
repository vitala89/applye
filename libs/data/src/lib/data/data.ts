import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'lib-data',
  imports: [],
  templateUrl: './data.html',
  styleUrl: './data.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Data {}
