import type { CvPhotoSection } from './document.model';

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
