import { Messages } from '../messages';

export const de: Messages = {
  meta: {
    title: 'Applye: Der Entwurf ist automatisiert. Das Absenden nicht.',
    description:
      'Eine kostenlose, quelloffene, lokal arbeitende Desktop-App für die KI-gestützte Jobsuche. Ehrliche Recruiter-Checks, angepasste Lebensläufe, ein Pipeline-Kanban. Deine Daten, dein Rechner, deine KI.',
  },

  nav: {
    methodology: 'Methodik',
    docs: 'Doku',
    changelog: 'Changelog',
    blog: 'Blog',
    viewSource: 'Quellcode ansehen',
    sourceSoon: 'Quellcode: bald',
    language: 'Sprache',
    themeToLight: 'Zum hellen Design wechseln',
    themeToDark: 'Zum dunklen Design wechseln',
  },

  footer: {
    tagline: 'Der Entwurf ist automatisiert. Das Absenden nicht.',
    docs: 'Doku',
    manifesto: 'Manifest',
    methodology: 'Methodik',
    compare: 'Vergleich',
    blog: 'Blog',
    changelog: 'Changelog',
    press: 'Presse',
    privacy: 'Datenschutz',
    cookies: 'Cookies',
    sustain: 'Unterstützen',
    licence: 'MIT-lizenziert',
    builtBy: 'Gebaut von',
  },

  consent: {
    body: 'Wir würden gern anonyme Seitenaufrufe zählen, um zu sehen, welche Doku sich zu schreiben lohnt. Ohne deine Zustimmung werden keine Cookies gesetzt und keine Anfragen an Google gesendet - und die App selbst sendet ohnehin nie etwas.',
    learnMore: 'Was erfasst wird',
    decline: 'Ablehnen',
    allow: 'Analyse erlauben',
  },

  docsInEnglishNote:
    'Die App gibt es in sechs Sprachen. Die Dokumentation ist derzeit nur auf Englisch - eine saubere Übersetzung braucht Zeit, und ein maschinell übersetztes Handbuch wäre schlechter als ein ehrlicher Link.',

  hero: {
    eyebrow: 'Das Prinzip der Augmentation',
    titleTop: 'Der Entwurf ist automatisiert.',
    titleAccent: 'Das Absenden nicht.',
    sub: 'Eine quelloffene, lokal arbeitende Desktop-App für die KI-gestützte Jobsuche. Deine Daten, dein Rechner, deine KI. Sie bewertet Stellen, passt deinen Lebenslauf an und verfolgt die Pipeline - jede Entscheidung bleibt bei dir.',
    download: 'Herunterladen',
    downloadSoon: 'Download (bald verfügbar)',
    viewSource: 'Quellcode auf GitHub ansehen',
    sourceSoon: 'Quellcode: bald verfügbar',
    meta: 'Kostenlos · MIT-lizenziert · Kein Konto · Keine Telemetrie',
  },

  gap: {
    eyebrow: 'Die Lücke, die wir füllen',
    title: 'Drei Werkzeuge, eines fehlt.',
    saasTitle: 'Cloud-SaaS',
    saasBody:
      'Mächtig, aber monatlich bezahlt - und deine gesamte Suche liegt auf fremden Servern. Wie Bewerbungen bei dir vor Ort laufen, ist nicht ihr Problem.',
    cliTitle: 'CLI-Pipelines',
    cliBody:
      'Vollständige Pipeline, lokal, kostenlos und exzellent. Aber nur im Terminal - also gemacht für Entwickler und sonst niemanden.',
    usTitle: 'Desktop, lokal, kostenlos',
    usBody:
      'Die komplette Pipeline als Desktop-Oberfläche: lokal, kostenlos, MIT-lizenziert und darauf eingestellt, wie Bewerbungen bei dir vor Ort tatsächlich laufen. Einrichtung in 3 Minuten statt 15. Kein Terminal nötig.',
    line: 'career-ops gibt Entwicklern eine CLI. Applye gibt allen einen Desktop.',
  },

  what: {
    eyebrow: 'Was ist Applye?',
    body: 'Applye ist eine Desktop-App, die den gesamten Bewerbungsablauf auf deinem Rechner abbildet. Du fügst eine Stellenanzeige ein; du bekommst einen ehrlichen HR- und ATS-Check; die App entwirft einen angepassten Lebenslauf, den du prüfst und exportierst; du schiebst die Stelle über ein Pipeline-Kanban; und sie hilft dir bei der Interviewvorbereitung. Alles lokal, mit deiner eigenen KI (eigener API-Schlüssel oder das CLI-Abo, das du ohnehin bezahlst) - MIT-lizenziert und kostenlos.',
  },

  features: {
    eyebrow: 'Was sie kann',
    title: 'Gebaut für Signal, nicht für Aufmunterung.',
    items: [
      {
        title: 'Ehrlicher Recruiter-Check',
        example:
          'Stelle einfügen und einen ehrlichen Passungswert bekommen: fehlende Schlüsselbegriffe, die Warnsignale, die eine Vorauswahl entdecken würde, und ein klares ATS-Bestanden oder -Durchgefallen - so, wie eine Person in den ersten zehn Sekunden liest.',
        note: 'Keine Aufmunterung. Nur Signal.',
        linkText: 'Wie die Bewertung funktioniert',
      },
      {
        title: 'Angepasster Lebenslauf in drei Durchgängen',
        example:
          'Eine XYZ-Umformulierung, dann eine doppelte Kritik, die mit sich selbst streitet, dann ein sauberer Aufbau als PDF, das ATS-Parser übersteht. Du liest jede Zeile, bevor daraus eine Datei wird.',
        note: 'Applye entwirft. Du prüfst, exportierst und sendest.',
      },
      {
        title: 'Pipeline als Kanban',
        example:
          'Zieh jede Stelle von gespeichert über beworben und Interview bis zum Angebot. Statuswechsel werden automatisch datiert, überfällige Bewerbungen bekommen ein Abzeichen - nichts schläft unbemerkt ein.',
        note: 'Dein Board, auf deinem Rechner, kein Anbieter-Dashboard.',
      },
      {
        title: 'Bring deine eigene KI mit',
        example:
          'Eigener API-Schlüssel, oder das CLI-Abo anbinden, das du schon bezahlst: Claude Code, Codex oder Gemini. Code erledigt die günstige, deterministische Arbeit; das Modell wird nur zum Urteilen gefragt.',
        note: 'Token-sparsam gebaut. Eine echte Suche kostet Cent-Beträge.',
      },
      {
        title: 'Lokal und privat',
        example:
          'Alles liegt in einer einzigen SQLite-Datei auf deiner Festplatte. Kein Konto, keine Cloud-Synchronisierung, keine Telemetrie. Datei löschen - und es ist weg.',
        note: 'Keine Cloud, kein Konto, kein Tracking. Nie.',
      },
    ],
  },

  local: {
    eyebrow: 'Lokale Regeln, berücksichtigt',
    title: 'Gemacht für die Suche, die du wirklich führst.',
    intro:
      'Eine Jobsuche ist lokal, selbst wenn die Stelle remote ist. Applye funktioniert überall - und wo ein Markt eigene Konventionen und Formalitäten hat, bildet es sie ab, statt so zu tun, als bewerbe sich die ganze Welt gleich.',
    points: [
      'Unterlagen in deiner Sprache: Lebenslauf, Anschreiben und Vorbereitung in sechs Sprachen, passend zu dem, was die Stelle erwartet.',
      'Lokale Konventionen: Foto oder kein Foto, Datums- und Layout-Normen und die ATS-Eigenheiten, die sich je Markt unterscheiden.',
      'Visum und Arbeitserlaubnis mitgedacht, inklusive Blauer Karte EU, für alle, die sich über eine Grenze hinweg bewerben.',
      'DSGVO-konform durch Architektur: deine Daten verlassen den Rechner gar nicht erst - damit ist auch die strengste Regelung erfüllt.',
      'Deutschland im Detail: den Eigenbemühungen-Nachweis für die Agentur für Arbeit direkt aus deinen erfassten Bewerbungen erzeugen.',
    ],
  },

  principles: [
    { label: 'Lokal zuerst', line: 'Eine SQLite-Datei auf deinem Rechner.' },
    { label: 'Datenschutz by Design', line: 'Es wird nichts erhoben. Keine Telemetrie.' },
    { label: 'Kostenlos / MIT', line: 'Quelloffen und kostenlos.' },
    { label: 'Eigene KI', line: 'Dein Schlüssel oder dein CLI-Abo.' },
    { label: 'Unterstützen statt automatisieren', line: 'Die KI entwirft. Du entscheidest.' },
  ],

  trust: {
    eyebrow: 'Quelloffen und ehrlich',
    title: 'Deine Daten verlassen deinen Rechner nicht.',
    body: 'Applye ist MIT-lizenziert und wird offen entwickelt. Lies den Code, lies die Datengarantie, betreibe es selbst.',
    repo: 'GitHub-Repository',
    repoSoon: 'Repository: bald verfügbar',
    guarantee: 'Garantie zur Datenhoheit',
    useTitle: 'Wann Applye passt',
    usePoints: [
      'Du willst weniger, dafür besser passende Bewerbungen.',
      'Dir ist wichtig, wo deine Bewerbungsdaten liegen.',
      'Du zahlst bereits für ein KI-Abo oder hast einen API-Schlüssel.',
      'Du bewirbst dich über Ländergrenzen hinweg oder in einem Markt mit eigenen Formalitäten.',
    ],
    notTitle: 'Was Applye nicht ist',
    notPoints: [
      'Kein Auto-Bewerbungs-Bot. Es sendet nie für dich.',
      'Kein Scraper für geschlossene Jobbörsen. Discover liest öffentliche APIs und Feeds; den Rest fügst du selbst ein.',
      'Kein Cloud-Dienst: kein Konto, kein Server, keine Synchronisierung.',
      'Kein Weg, Erfahrung vorzutäuschen. Ehrlichkeit statt Aufblähen.',
    ],
  },

  faq: {
    eyebrow: 'FAQ',
    title: 'Klare Antworten.',
    items: [
      {
        q: 'Wie funktioniert die Bewertung?',
        a: 'Du fügst eine Stellenanzeige ein; Code extrahiert die Anforderungen, und Applye bittet deine KI, sie wie ein Recruiter oder ein ATS zu lesen: Passungswert, fehlende Schlüsselbegriffe, Warnsignale. Dieselbe Stelle wird nie zweimal bewertet - Ergebnisse werden anhand eines Text-Hashes zwischengespeichert.',
      },
      {
        q: 'Ist es wirklich kostenlos?',
        a: 'Ja. Applye ist MIT-lizenziert und kostenlos: keine Bezahlstufe, kein Abo. Bezahlen könntest du höchstens deine eigene KI-Nutzung, und die rechnet dein Anbieter ab, nicht wir.',
      },
      {
        q: 'Welche KI brauche ich?',
        a: 'Entweder einen eigenen API-Schlüssel oder ein CLI-Abo, das du schon hast (Claude Code, Codex oder Gemini CLI), angebunden ohne zusätzliche API-Token. KI ist opt-in: Es wird kein Modell aufgerufen, bevor du es verlangst.',
      },
      {
        q: 'Sind meine Daten privat?',
        a: 'Vollständig. Profil, Stellen und Dokumente liegen in einer lokalen SQLite-Datenbank auf deinem Rechner. Keine Cloud, kein Konto, keine Analyse. Discover holt Stellen direkt aus öffentlichen APIs und Feeds auf deinen Rechner - niemand erfährt, wonach du gesucht hast - und alles Übrige fügst du selbst ein.',
      },
      {
        q: 'Bewirbt es sich automatisch für mich?',
        a: 'Niemals. Um diese Grenze herum ist die ganze App gebaut. Applye bewertet, entwirft und schlägt vor - dann gibt es die Kontrolle zurück. Du liest jedes Wort und klickst selbst auf Absenden. Auf der anderen Seite sitzt ein Mensch, und die Beziehung gehört dir, nicht einem Bot.',
      },
      {
        q: 'Funktioniert es auch außerhalb Deutschlands?',
        a: 'Ja, überall. Der Kernablauf setzt kein Land voraus: Du fügst eine Stelle ein, sie wird gegen dein Profil bewertet, du passt an und verfolgst sie. Was sich je Markt unterscheidet, sind die Formalitäten drumherum - und die bildet Applye ab, wo es sie gibt: für Deutschland der Eigenbemühungen-Nachweis und deutschsprachige Unterlagen, für Bewerbungen über Grenzen hinweg Visum- und Blaue-Karte-Hinweise. Das sind Zugaben, keine Voraussetzungen.',
      },
    ],
  },
};
