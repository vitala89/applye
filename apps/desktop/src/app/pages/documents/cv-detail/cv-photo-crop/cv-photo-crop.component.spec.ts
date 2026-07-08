import { TestBed } from '@angular/core/testing';
import { CvPhotoCropComponent } from './cv-photo-crop.component';

describe('CvPhotoCropComponent', () => {
  it('exposes 3:4 target dimensions', () => {
    const fixture = TestBed.createComponent(CvPhotoCropComponent);
    const c = fixture.componentInstance;
    expect(c.TARGET_W / c.TARGET_H).toBeCloseTo(3 / 4, 5);
  });
});
