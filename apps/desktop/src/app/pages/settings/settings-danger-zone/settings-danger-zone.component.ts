import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LoaderCircle, LucideAngularModule, Trash2 } from 'lucide-angular';

/**
 * Factory reset, behind its own confirmation.
 *
 * **The page owns `confirming`, not this component.** A failed reset closes the
 * confirmation as well as clearing the running flag, and a child-local flag
 * could not be closed from there - the block would stay open over an error the
 * user has already been told about. The state is one boolean either way; this
 * placement is the one that keeps the failure path intact.
 *
 * The trigger is deliberately quiet - `btn--danger`, red only on hover - and
 * only the confirm step is solid. Deleting everything is not a control that
 * should look pressed-in at rest.
 */
@Component({
  selector: 'app-settings-danger-zone',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  templateUrl: './settings-danger-zone.component.html',
  styleUrl: './settings-danger-zone.component.scss',
})
export class SettingsDangerZoneComponent {
  readonly confirming = input(false);
  readonly resetting = input(false);

  readonly confirmingChanged = output<boolean>();
  readonly resetConfirmed = output<void>();

  protected readonly icons = {
    remove: Trash2,
    loader: LoaderCircle,
  };
}
