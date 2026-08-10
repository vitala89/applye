import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  encodeGeoScopes,
  encodeLocalMarkets,
  type MarketSourcePlan,
  type Settings,
} from '@applye/core';
import { TranslateService } from '@applye/i18n';
import { SettingsGeoTargetComponent } from './settings-geo-target.component';

/**
 * The two halves of "where do you want to work?" are mutually exclusive, and
 * which one is active is derived from the settings row rather than stored
 * beside it. These tests pin that derivation, because it is the only thing on
 * screen that says which mode the scan is in.
 */
describe('SettingsGeoTargetComponent', () => {
  let fixture: ComponentFixture<SettingsGeoTargetComponent>;

  function settings(over: Partial<Settings> = {}): Settings {
    return { geoScope: '', market: '', ...over } as Settings;
  }

  function chips(): { label: string; on: boolean; muted: boolean }[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('.geo-chip') as NodeListOf<HTMLElement>,
    ).map((el) => ({
      label: (el.textContent ?? '').trim(),
      on: el.classList.contains('geo-chip--on'),
      muted: !!el.closest('.geo-chips--muted'),
    }));
  }

  function checkedLabels(): string[] {
    return chips()
      .filter((c) => c.on)
      .map((c) => c.label);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SettingsGeoTargetComponent],
      providers: [TranslateService],
    });
    fixture = TestBed.createComponent(SettingsGeoTargetComponent);
    fixture.componentRef.setInput('settings', settings());
    fixture.detectChanges();
  });

  it('lights Worldwide when neither half is set', () => {
    expect(checkedLabels().length).toBe(1);
    expect(chips()[0].on).toBe(true);
  });

  it('lights the stored regions and drops Worldwide', () => {
    fixture.componentRef.setInput('settings', settings({ geoScope: encodeGeoScopes(['europe']) }));
    fixture.detectChanges();

    expect(chips()[0].on).toBe(false);
    expect(checkedLabels().length).toBe(1);
  });

  /** The whole point of the pair: a stored market wins, and the region row goes
   * inert even if geoScope still holds something. */
  it('mutes the region row and ignores its scopes once a market is set', () => {
    fixture.componentRef.setInput(
      'settings',
      settings({ geoScope: encodeGeoScopes(['europe']), market: encodeLocalMarkets(['de']) }),
    );
    fixture.detectChanges();

    const muted = chips().filter((c) => c.muted);
    expect(muted.length).toBeGreaterThan(0);
    expect(muted.every((c) => !c.on)).toBe(true);
    expect(checkedLabels().length).toBe(1);
  });

  /** Muted is not disabled: clicking a region chip is how the user switches
   * back, so it must still report. */
  it('still reports a region toggle while the row is muted', () => {
    fixture.componentRef.setInput('settings', settings({ market: encodeLocalMarkets(['de']) }));
    fixture.detectChanges();
    const seen: string[] = [];
    fixture.componentInstance.scopeToggled.subscribe((k) => seen.push(k));

    const regionInputs = fixture.nativeElement.querySelectorAll(
      '.geo-chips--muted .geo-chip input',
    ) as NodeListOf<HTMLInputElement>;
    // The first chip in the muted row is Worldwide, which has its own output.
    regionInputs[1].dispatchEvent(new Event('change'));

    expect(seen.length).toBe(1);
  });

  it('reports Worldwide and market picks separately', () => {
    let worldwide = 0;
    const markets: string[] = [];
    fixture.componentInstance.worldwideSelected.subscribe(() => worldwide++);
    fixture.componentInstance.marketToggled.subscribe((m) => markets.push(m));

    const rows = fixture.nativeElement.querySelectorAll('.geo-chips') as NodeListOf<HTMLElement>;
    (rows[0].querySelector('input') as HTMLInputElement).dispatchEvent(new Event('change'));
    (rows[1].querySelector('input') as HTMLInputElement).dispatchEvent(new Event('change'));

    expect(worldwide).toBe(1);
    expect(markets.length).toBe(1);
  });

  describe('the source-change confirmation', () => {
    const plan: MarketSourcePlan = {
      toEnable: [{ id: 1, name: 'StepStone', host: 'stepstone.de' }],
      toDisable: [{ id: 2, name: 'Indeed UK', host: 'indeed.co.uk' }],
    } as MarketSourcePlan;

    it('is absent until a plan arrives', () => {
      expect(fixture.nativeElement.querySelector('.confirm')).toBeNull();
    });

    it('names every source on both sides', () => {
      fixture.componentRef.setInput('plan', plan);
      fixture.detectChanges();

      const text = (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ');
      expect(text).toContain('StepStone');
      expect(text).toContain('stepstone.de');
      expect(text).toContain('Indeed UK');
      expect(fixture.nativeElement.querySelector('.confirm')).not.toBeNull();
    });

    it('reports apply and dismiss, and disables both while applying', () => {
      fixture.componentRef.setInput('plan', plan);
      fixture.detectChanges();
      let applied = 0;
      let dismissed = 0;
      fixture.componentInstance.planApplied.subscribe(() => applied++);
      fixture.componentInstance.planDismissed.subscribe(() => dismissed++);

      const actions = fixture.nativeElement.querySelectorAll(
        '.confirm__actions button',
      ) as NodeListOf<HTMLButtonElement>;
      actions[0].click();
      actions[1].click();
      expect(applied).toBe(1);
      expect(dismissed).toBe(1);

      fixture.componentRef.setInput('applyingPlan', true);
      fixture.detectChanges();
      const busy = fixture.nativeElement.querySelectorAll(
        '.confirm__actions button',
      ) as NodeListOf<HTMLButtonElement>;
      expect([busy[0].disabled, busy[1].disabled]).toEqual([true, true]);
    });
  });
});
