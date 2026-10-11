import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { openUrl } from '@tauri-apps/plugin-opener';
import { FollowupDraftService, ToastService } from '@applye/application';
import { PipelineCard } from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { FollowupComposerComponent } from './followup-composer.component';

jest.mock('@tauri-apps/plugin-opener', () => ({ openUrl: jest.fn() }));

const CARD = { id: 4, company: 'Acme', title: 'Engineer', overdue: true } as PipelineCard;

describe('FollowupComposerComponent', () => {
  const writeText = jest.fn(async () => undefined);

  function setup() {
    const followup = {
      language: signal('en'),
      subject: signal('Following up'),
      body: signal('Hello there'),
      drafting: signal(false),
      fromCache: signal(false),
      error: signal(''),
      copied: signal(false),
      to: signal('hr@acme.test'),
      cc: signal(''),
      hasDraft: signal(true),
      draftText: () => 'Following up\n\nHello there',
      mailtoUrl: () => 'mailto:hr@acme.test?subject=Following%20up&body=Hello%20there',
      markCopied: jest.fn(() => followup.copied.set(true)),
      langName: () => 'English',
      changeLanguage: jest.fn(),
      draft: jest.fn(),
    };
    TestBed.configureTestingModule({
      imports: [FollowupComposerComponent],
      providers: [
        { provide: FollowupDraftService, useValue: followup },
        { provide: TranslateService, useValue: { t: () => (key: string) => key } },
        { provide: ToastService, useValue: { error: jest.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(FollowupComposerComponent);
    fixture.componentRef.setInput('card', CARD);
    fixture.detectChanges();
    return { fixture, followup };
  }

  beforeEach(() => {
    writeText.mockClear();
    Object.assign(navigator, { clipboard: { writeText } });
    (openUrl as jest.Mock).mockReset().mockResolvedValue(undefined);
  });

  it('copies the draft text and then marks it copied', async () => {
    const { fixture, followup } = setup();
    const button = [...fixture.nativeElement.querySelectorAll('button')].find(
      (el: HTMLButtonElement) => el.textContent?.includes('followup.copy'),
    ) as HTMLButtonElement;

    button.click();
    await fixture.whenStable();

    expect(writeText).toHaveBeenCalledWith('Following up\n\nHello there');
    expect(followup.markCopied).toHaveBeenCalled();
    expect(followup.copied()).toBe(true);
  });

  it('opens the mailto URL the draft produced', async () => {
    const { fixture } = setup();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-primary');

    button.click();
    await fixture.whenStable();

    expect(openUrl).toHaveBeenCalledWith(
      'mailto:hr@acme.test?subject=Following%20up&body=Hello%20there',
    );
  });
});
