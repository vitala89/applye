import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'lib-ui',
  imports: [],
  templateUrl: './ui.html',
  styleUrl: './ui.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Ui {}
