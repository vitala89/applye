import type { CvPhotoSection } from './cv-content.model';
import { PAGE_SETTINGS_DEFAULT } from './page-settings.model';

describe('CvPhotoSection', () => {
  it('carries an optional dataUri', () => {
    const s: CvPhotoSection = {
      key: 'photo',
      order: 0,
      visible: true,
      dataUri: 'data:image/jpeg;base64,AAAA',
    };
    expect(s.dataUri).toContain('data:image/jpeg;base64,');
  });
});

describe('PAGE_SETTINGS_DEFAULT', () => {
  it('defaults to A4 with 20mm on all four sides', () => {
    expect(PAGE_SETTINGS_DEFAULT).toEqual({
      size: 'a4',
      margin: { top: 20, right: 20, bottom: 20, left: 20 },
    });
  });
});
