import { SupportedLanguage } from '@applye/core';

import { TRANSLATIONS, TranslationMap } from './translations';

// Two guards over the shipped locales.
//
// The first is key parity: every locale must resolve exactly the keys `en`
// resolves. `resolve()` renders a missing key as the key itself, so a locale
// that drops one shows the user `actions.close` where a label belongs.
//
// The second is the one parity alone cannot catch: a key can be present and
// still be the English string, which is what the four stub locales were before
// they were completed. A locale that quietly reverts to English passes a key
// check and fails a user. Anything genuinely identical across languages -
// product names, URLs, format placeholders, empty strings, and real cognates
// like the French "Documents" - is listed in SHARED_WITH_ENGLISH, per locale,
// so the exception has to be stated rather than assumed.

const LOCALES: SupportedLanguage[] = ['de', 'ru', 'es', 'fr', 'uk'];

const SHARED_WITH_ENGLISH: Record<string, SupportedLanguage[]> = {
  'nav.pipeline': ['de', 'fr'],
  // German took the English loanword: "das Update" is what the badge says.
  'updater.badge': ['de'],
  'nav.documents': ['fr'],
  'nav.section_system': ['de'],
  'nav.local_badge': ['es', 'fr'],
  'discover.strip_tokens': ['de', 'es'],
  'discover.con_line_err': ['es'],
  'discover.remote': ['de'],
  'discover.sources': ['fr'],
  'discover.match_chip': ['de'],
  'discover.fact_source': ['fr'],
  'discover.type_remote': ['de'],
  'discover.type_hybrid': ['de'],
  'discover.hybrid': ['de'],
  'discover.region_europe': ['fr'],
  'discover.region_usa': ['de'],
  'discover.region_asia': ['es'],
  'discover.loc_europe': ['fr'],
  'discover.loc_usa': ['de'],
  'discover.loc_asia': ['es'],
  'discover.drawer_title': ['fr'],
  'discover.rss_url_ph': ['de', 'ru', 'es', 'fr', 'uk'],
  'discover.slug_ph': ['ru', 'es', 'fr', 'uk'],
  'discover.error_short': ['es'],
  'myjobs.import_col_notes': ['fr'],
  'myjobs.col_score': ['de', 'fr'],
  'myjobs.col_status': ['de'],
  'myjobs.col_source': ['fr'],
  'pasteModal.link_placeholder': ['de', 'ru', 'es', 'fr', 'uk'],
  'analytics.kpi_interviews': ['de'],
  'analytics.score_median': ['de'],
  'analytics.outcome_interview': ['de'],
  'analytics.ttr_median': ['de'],
  'analytics.ttr_d': ['es'],
  'tracker.col_status': ['de'],
  'tracker.col_notes': ['fr'],
  'tracker.col_tech_stack': ['de'],
  'tracker.col_interview1': ['de'],
  'tracker.col_followup2': ['de'],
  'tracker.col_contact': ['fr'],
  'tracker.export_de': ['de'],
  'tracker.report_title': ['de', 'ru', 'es', 'fr', 'uk'],
  'tracker.report_name': ['de'],
  'tracker.ctype_text': ['de'],
  'tracker.ctype_date': ['fr'],
  'tracker.orientation': ['fr'],
  'ai.mode_api': ['de', 'ru', 'es', 'fr', 'uk'],
  'ai.mode_cli': ['de', 'ru', 'es', 'fr', 'uk'],
  'common.no': ['es'],
  'pipeline.quickview_status': ['de'],
  'pipeline.priority_': ['de', 'ru', 'es', 'fr', 'uk'],
  'followup.cc_placeholder': ['de'],
  'profile.field_email': ['ru', 'es', 'uk'],
  'profile.field_website': ['de'],
  'profile.field_linkedin': ['de', 'ru', 'es', 'fr', 'uk'],
  'profile.education_institution': ['de'],
  'profile.comp_min': ['de', 'fr'],
  'profile.comp_max': ['de', 'fr'],
  'profile.section_photo': ['fr'],
  'profile.field_': ['de', 'ru', 'es', 'fr', 'uk'],
  'jobs.portal_question_label': ['fr'],
  'jobs.dimensions_title': ['fr'],
  'jobs.tokens_used': ['es'],
  'jobs.gap.question_of': ['fr'],
  'jobs.wizard.final_checks_ats': ['de', 'ru', 'es', 'fr', 'uk'],
  'settings.local_market_fr': ['fr'],
  'settings.local_market_ua': ['de', 'fr'],
  'settings.tier_economy': ['de'],
  'settings.tier_quality': ['de'],
  'dashboard.card_interview_in': ['de'],
  'documents.title': ['fr'],
  'documents.tab_cv': ['es', 'fr'],
  'documents.cover_letter_field_date': ['fr'],
  'documents.cover_letter_field_signature': ['fr'],
  'documents.cover_letter_tone_formal': ['es'],
  'documents.cover_letter_length_concise': ['fr'],
  'documents.cover_letter_length_standard': ['de', 'fr'],
  'documents.cv_field_region': ['de'],
  'documents.cv_field_email': ['ru', 'es', 'uk'],
  'documents.cv_field_website': ['de'],
  'documents.cv_field_linkedin': ['de', 'ru', 'es', 'fr', 'uk'],
  'documents.cv_field_institution': ['de'],
  'documents.cv_section_photo': ['fr'],
  'documents.cv_photo_crop_zoom': ['de', 'es', 'fr'],
  'documents.cv_theme_aurora': ['de', 'ru', 'es', 'fr', 'uk'],
  'documents.cv_style_color': ['es'],
  'documents.cv_style_weight_400': ['de', 'es'],
  'documents.cv_style_group_page': ['fr'],
  'documents.cv_style_group_text': ['de'],
  'documents.cv_section_style': ['fr'],
  'documents.cv_style_line_height_compact': ['fr'],
  'documents.cv_style_line_height_normal': ['de', 'es', 'fr'],
  'documents.cv_live_style_format': ['de', 'fr'],
  'documents.cv_style_page_a4': ['de', 'ru', 'es', 'fr', 'uk'],
  'documents.cv_style_page_letter': ['de', 'ru', 'fr', 'uk'],
  'documents.cv_style_margin_normal': ['de'],
  'documents.cv_style_page_count': ['fr'],
  'interview.col_status': ['de'],
  'interview.interviewer': ['de'],
  'interview.stage_type_label': ['fr'],
  'interview.stage_date_label': ['fr'],
  'interview.stage_notes': ['fr'],
  'interview.type_': ['de', 'ru', 'es', 'fr', 'uk'],
  'interview.type_system_design': ['ru', 'uk'],
  'interview.type_final': ['de', 'es', 'fr'],
  'interview.status_': ['de', 'ru', 'es', 'fr', 'uk'],
  'interview.star_situation': ['de', 'fr'],
  'interview.star_action': ['fr'],
  'onboarding.ai.gemini.name': ['de', 'ru', 'es', 'fr', 'uk'],
  'onboarding.ai.gemini.vendor': ['de', 'ru', 'es', 'fr', 'uk'],
  'onboarding.ai.gemini.console_label': ['de', 'ru', 'es', 'fr', 'uk'],
  'onboarding.ai.cli.claude_name': ['de', 'ru', 'es', 'fr', 'uk'],
  'onboarding.ai.cli.openai_name': ['de', 'ru', 'es', 'fr', 'uk'],
  'onboarding.ai.claude.name': ['de', 'ru', 'es', 'fr', 'uk'],
  'onboarding.ai.claude.vendor': ['de', 'ru', 'es', 'fr', 'uk'],
  'onboarding.ai.claude.console_label': ['de', 'ru', 'es', 'fr', 'uk'],
  'onboarding.ai.openai.name': ['de', 'ru', 'es', 'fr', 'uk'],
  'onboarding.ai.openai.vendor': ['de', 'ru', 'es', 'fr', 'uk'],
  'onboarding.ai.openai.console_label': ['de', 'ru', 'es', 'fr', 'uk'],
  'onboarding.ai.deepseek.name': ['de', 'ru', 'es', 'fr', 'uk'],
  'onboarding.ai.deepseek.vendor': ['de', 'ru', 'es', 'fr', 'uk'],
  'onboarding.ai.deepseek.console_label': ['de', 'ru', 'es', 'fr', 'uk'],
  'onboarding.preview.field_email': ['ru', 'es', 'uk'],
};

function flatten(map: TranslationMap, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(map)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flatten(value as TranslationMap, full));
    } else {
      out[full] = value as string;
    }
  }
  return out;
}

const en = flatten(TRANSLATIONS.en);

describe('translations', () => {
  it.each(LOCALES)('%s resolves the same keys as en', (lang) => {
    expect(Object.keys(flatten(TRANSLATIONS[lang])).sort()).toEqual(Object.keys(en).sort());
  });

  it.each(LOCALES)('%s translates every key that is not shared with English', (lang) => {
    const locale = flatten(TRANSLATIONS[lang]);
    const untranslated = Object.keys(en).filter(
      (key) => locale[key] === en[key] && !SHARED_WITH_ENGLISH[key]?.includes(lang),
    );
    expect(untranslated).toEqual([]);
  });

  it('does not allow a key to stay English in a locale that has moved on', () => {
    const stale = Object.entries(SHARED_WITH_ENGLISH).flatMap(([key, langs]) =>
      langs
        .filter((lang) => flatten(TRANSLATIONS[lang])[key] !== en[key])
        .map((lang) => `${key} (${lang})`),
    );
    expect(stale).toEqual([]);
  });
});
