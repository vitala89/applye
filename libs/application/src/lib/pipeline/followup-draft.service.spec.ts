import { TestBed } from '@angular/core/testing';
import { PipelineCard } from '@applye/core';
import { AiService, DbService, DraftsGateway } from '@applye/data';
import { FollowupDraftService, parseFollowupDraft } from './followup-draft.service';

jest.mock('@tauri-apps/plugin-opener', () => ({ openUrl: jest.fn() }));
import { openUrl } from '@tauri-apps/plugin-opener';

/**
 * Follow-up drafting extracted out of the quick-view modal, which had reached
 * its size budget. One cached AI call per (application, language, model); the
 * only way a draft leaves Applye is the user's own mail client via `mailto:`.
 */
describe('FollowupDraftService', () => {
  let db: {
    getSettings: jest.Mock;
    hashText: jest.Mock;
  };
  let drafts: { followupDraftGet: jest.Mock; followupDraftSave: jest.Mock };
  let ai: { renderSkill: jest.Mock; run: jest.Mock };

  const card = { id: 7, company: 'Northlane', title: 'UI Engineer' } as PipelineCard;

  function make(): FollowupDraftService {
    db = {
      getSettings: jest.fn(async () => ({
        aiMode: 'api',
        provider: 'claude',
        economyModel: 'm',
      })),
      hashText: jest.fn(async () => 'h1'),
    };
    drafts = {
      followupDraftGet: jest.fn(async () => null),
      followupDraftSave: jest.fn(async () => undefined),
    };
    ai = {
      renderSkill: jest.fn(async () => ({ systemPrompt: 's', userPrompt: 'u' })),
      run: jest.fn(async () => ({
        text: JSON.stringify({ subject: 'Following up', body: 'Line one\\nLine two' }),
        tokensInput: 3,
        tokensOutput: 9,
      })),
    };
    (openUrl as jest.Mock).mockClear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        FollowupDraftService,
        { provide: DbService, useValue: db },
        { provide: DraftsGateway, useValue: drafts },
        { provide: AiService, useValue: ai },
      ],
    });
    return TestBed.inject(FollowupDraftService);
  }

  describe('parseFollowupDraft', () => {
    it('turns a double-escaped newline into a real line break', () => {
      expect(parseFollowupDraft('{"subject":"s","body":"a\\\\nb"}').body).toBe('a\nb');
    });

    it('leaves a correctly escaped reply alone', () => {
      expect(parseFollowupDraft('{"subject":"s","body":"a\\nb"}').body).toBe('a\nb');
    });

    it('tolerates missing fields', () => {
      expect(parseFollowupDraft('{}')).toEqual({ subject: '', body: '' });
    });
  });

  describe('draft', () => {
    it('serves a cached draft without spending tokens', async () => {
      const s = make();
      drafts.followupDraftGet.mockResolvedValueOnce({ subject: 'cached', body: 'body' });
      await s.draft(card);
      expect(ai.run).not.toHaveBeenCalled();
      expect(s.subject()).toBe('cached');
      expect(s.fromCache()).toBe(true);
    });

    it('drafts, normalises the body and caches the result', async () => {
      const s = make();
      await s.draft(card);
      expect(s.subject()).toBe('Following up');
      expect(s.body()).toBe('Line one\nLine two');
      expect(s.fromCache()).toBe(false);
      expect(drafts.followupDraftSave).toHaveBeenCalledWith(
        expect.objectContaining({ applicationId: 7, inputHash: 'h1', language: 'en' }),
      );
      expect(s.drafting()).toBe(false);
    });

    it('sends the spelled-out language name to the model, not the 2-letter code', async () => {
      const s = make();
      s.changeLanguage('uk');
      await s.draft(card);
      expect(ai.renderSkill).toHaveBeenCalledWith(
        'followup',
        expect.objectContaining({ language: 'Ukrainian' }),
      );
      expect(ai.run).toHaveBeenCalledWith(expect.objectContaining({ language: 'uk' }));
    });

    it('records the error, rethrows it and clears the busy flag', async () => {
      const s = make();
      ai.run.mockRejectedValueOnce(new Error('provider down'));
      await expect(s.draft(card)).rejects.toThrow('provider down');
      expect(s.error()).toContain('provider down');
      expect(s.drafting()).toBe(false);
      expect(drafts.followupDraftSave).not.toHaveBeenCalled();
    });

    it('ignores a second call while one is in flight', async () => {
      const s = make();
      const first = s.draft(card);
      await s.draft(card);
      await first;
      expect(ai.run).toHaveBeenCalledTimes(1);
    });
  });

  it('changing language drops the current draft, since it no longer matches', async () => {
    const s = make();
    await s.draft(card);
    s.changeLanguage('de');
    expect(s.subject()).toBe('');
    expect(s.body()).toBe('');
    expect(s.fromCache()).toBe(false);
    expect(s.language()).toBe('de');
  });

  it('resetFor seeds the language from the card and clears everything else', () => {
    const s = make();
    s.to.set('a@b.c');
    s.error.set('boom');
    s.resetFor({ ...card, docLanguage: 'fr' } as PipelineCard);
    expect(s.language()).toBe('fr');
    expect(s.to()).toBe('');
    expect(s.error()).toBe('');
  });

  describe('openInMail', () => {
    it('percent-encodes spaces as %20, not +, so mail clients decode them', async () => {
      const s = make();
      s.to.set('hr@northlane.io');
      s.subject.set('Following up');
      s.body.set('Hello there');
      await s.openInMail();
      const url = (openUrl as jest.Mock).mock.calls[0][0] as string;
      expect(url).toContain('subject=Following%20up');
      expect(url).not.toContain('+');
    });

    it('omits empty fields rather than sending blank params', async () => {
      const s = make();
      s.to.set('hr@northlane.io');
      s.subject.set('Following up');
      await s.openInMail();
      const url = (openUrl as jest.Mock).mock.calls[0][0] as string;
      expect(url).not.toContain('cc=');
      expect(url).not.toContain('body=');
    });
  });
});
