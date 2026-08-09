import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProfilePhotoStore } from '@applye/application';
import { DbService } from '@applye/data';
import { TranslateService } from '@applye/i18n';
import { ToastService } from '../../../core/toast/toast.service';
import { ProfilePhotoComponent } from './profile-photo.component';

const DATA_URI = 'data:image/png;base64,AAA';

/** `cropSourceUri` and `saving` are `ProfilePhotoStore`'s since ADR-0005
 * amendment twenty-eight, and the store is component-scoped - so it comes from
 * the component's own injector. `uri` stayed on the component, because it is a
 * `linkedSignal` on a required input. */
const storeOf = (fixture: ComponentFixture<ProfilePhotoComponent>): ProfilePhotoStore =>
  fixture.debugElement.injector.get(ProfilePhotoStore);

interface Db {
  setProfilePhoto: jest.Mock;
  cvPhotoReadFile: jest.Mock;
}

interface Toast {
  success: jest.Mock;
  error: jest.Mock;
}

let db: Db;
let toast: Toast;

function createFixture(photo: string | null): ComponentFixture<ProfilePhotoComponent> {
  db = {
    setProfilePhoto: jest.fn().mockResolvedValue({}),
    cvPhotoReadFile: jest.fn().mockResolvedValue(DATA_URI),
  };
  toast = { success: jest.fn(), error: jest.fn() };
  TestBed.configureTestingModule({
    imports: [ProfilePhotoComponent],
    providers: [
      TranslateService,
      { provide: DbService, useValue: db },
      { provide: ToastService, useValue: toast },
    ],
  });
  const fixture = TestBed.createComponent(ProfilePhotoComponent);
  fixture.componentRef.setInput('photo', photo);
  fixture.componentRef.setInput('open', true);
  fixture.detectChanges();
  return fixture;
}

function thumb(fixture: ComponentFixture<ProfilePhotoComponent>): HTMLImageElement | null {
  return fixture.nativeElement.querySelector('.photo-editor__thumb');
}

/** The saved and removed toasts read differently, so asserting the rendered
 * string is what tells the two branches apart. */
function translate(fixture: ComponentFixture<ProfilePhotoComponent>, key: string): string {
  return fixture.componentInstance['t']()(key);
}

describe('ProfilePhotoComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders the photo it was seeded with', () => {
    const fixture = createFixture(DATA_URI);
    expect(thumb(fixture)?.getAttribute('src')).toBe(DATA_URI);
  });

  it('renders the upload button and no thumb when there is no photo', () => {
    const fixture = createFixture(null);
    expect(thumb(fixture)).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.btn-dashed').length).toBe(1);
  });

  /** The photo has its own backend command, so removing it must write through
   * immediately rather than waiting for the page's Save button. */
  it('persists the removal and drops the thumb', async () => {
    const fixture = createFixture(DATA_URI);
    await fixture.componentInstance['remove']();
    fixture.detectChanges();

    expect(db.setProfilePhoto).toHaveBeenCalledWith(null);
    expect(thumb(fixture)).toBeNull();
    expect(toast.success).toHaveBeenCalledWith(translate(fixture, 'profile.photo_removed'));
  });

  it('persists a confirmed crop and closes the modal', async () => {
    const fixture = createFixture(null);
    // The modal has to be open first, or "it closed" is true before the call.
    storeOf(fixture).cropSourceUri.set('data:image/png;base64,SRC');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-cv-photo-crop')).not.toBeNull();

    await fixture.componentInstance['onCropConfirmed'](DATA_URI);
    fixture.detectChanges();

    expect(db.setProfilePhoto).toHaveBeenCalledWith(DATA_URI);
    expect(storeOf(fixture).cropSourceUri()).toBeNull();
    expect(thumb(fixture)?.getAttribute('src')).toBe(DATA_URI);
    expect(toast.success).toHaveBeenCalledWith(translate(fixture, 'profile.photo_saved'));
  });

  /** The optimistic write has to be undone, or the page shows a photo the
   * database does not have. */
  it('rolls back to the previous photo when the write fails', async () => {
    const fixture = createFixture(DATA_URI);
    db.setProfilePhoto.mockRejectedValueOnce(new Error('disk full'));

    await fixture.componentInstance['remove']();
    fixture.detectChanges();

    expect(thumb(fixture)?.getAttribute('src')).toBe(DATA_URI);
    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  /** Rolls back to what was on screen, not to what the profile row last
   * reported: after a local removal those two differ, and restoring the seed
   * would put an already-deleted photo back. */
  it('rolls back to the local value, not to the seed', async () => {
    const fixture = createFixture(DATA_URI);
    await fixture.componentInstance['remove']();
    fixture.detectChanges();
    expect(thumb(fixture)).toBeNull();

    db.setProfilePhoto.mockRejectedValueOnce(new Error('disk full'));
    await fixture.componentInstance['onCropConfirmed']('data:image/png;base64,BBB');
    fixture.detectChanges();

    expect(thumb(fixture)).toBeNull();
  });

  /** Two writes in flight would let the loser's rollback value win. */
  it('ignores a second write while one is in flight', async () => {
    const fixture = createFixture(DATA_URI);
    let release: () => void = () => undefined;
    db.setProfilePhoto.mockImplementationOnce(
      () => new Promise<void>((resolve) => (release = () => resolve())),
    );

    const first = fixture.componentInstance['remove']();
    await fixture.componentInstance['onCropConfirmed'](DATA_URI);
    expect(db.setProfilePhoto).toHaveBeenCalledTimes(1);

    release();
    await first;
  });

  it('cancelling the crop writes nothing', () => {
    const fixture = createFixture(null);
    storeOf(fixture).cropSourceUri.set(DATA_URI);
    fixture.componentInstance['onCropCancelled']();

    expect(storeOf(fixture).cropSourceUri()).toBeNull();
    expect(db.setProfilePhoto).not.toHaveBeenCalled();
  });

  /** `photo` is a seed, not a binding: a local edit outlives an unchanged
   * input, and a reloaded profile re-seeds it. */
  it('keeps a local edit until the profile reports a different photo', async () => {
    const fixture = createFixture(DATA_URI);
    await fixture.componentInstance['remove']();
    fixture.detectChanges();
    expect(thumb(fixture)).toBeNull();

    fixture.componentRef.setInput('photo', DATA_URI);
    fixture.detectChanges();
    expect(thumb(fixture)).toBeNull();

    fixture.componentRef.setInput('photo', 'data:image/png;base64,BBB');
    fixture.detectChanges();
    expect(thumb(fixture)?.getAttribute('src')).toBe('data:image/png;base64,BBB');
  });
});
