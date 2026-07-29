<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/brand/wordmark-dark.svg">
    <img src="docs/assets/brand/wordmark-light.svg" alt="Applye" width="250" height="56">
  </picture>
</p>

<div align="center">

[English](README.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Українська](README.uk.md) | [Polski](README.pl.md)

</div>

<p align="center">
  <em>Unternehmen filtern Bewerber mit KI. Applye gibt Bewerbern einen Desktop, um zu antworten.</em><br>
  <strong>Entwürfe sind automatisiert. Das Absenden nicht.</strong>
</p>

<p align="center">
  <img src="docs/assets/hero-banner.png" alt="Applye Desktop-App - Dashboard mit aktiven Bewerbungen, überfälligen Follow-ups und anstehenden Interviews" width="800">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.28.0-4F5BFF?style=flat" alt="Version 0.28.0">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT-Lizenz">
  <img src="https://img.shields.io/badge/Tauri-2-24C8DB?style=flat&logo=tauri&logoColor=white" alt="Tauri 2">
  <img src="https://img.shields.io/badge/Angular-21-DD0031?style=flat&logo=angular&logoColor=white" alt="Angular">
  <img src="https://img.shields.io/badge/Rust-2021-000000?style=flat&logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/SQLite-local--first-003B57?style=flat&logo=sqlite&logoColor=white" alt="SQLite">
  <br>
  <img src="https://img.shields.io/badge/Kein_Konto-nötig-2ea44f?style=flat" alt="Kein Konto">
  <img src="https://img.shields.io/badge/Keine_Telemetrie-niemals-2ea44f?style=flat" alt="Keine Telemetrie">
  <img src="https://img.shields.io/badge/Deine_KI-deine_Schlüssel-4F5BFF?style=flat" alt="Bring deine eigene KI">
</p>

<p align="center">
  <a href="https://applye.dev">Website</a> ·
  <a href="https://applye.dev/docs">Doku</a> ·
  <a href="https://applye.dev/methodology">Methodik</a> ·
  <a href="ROADMAP.md">Roadmap</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

---

<p align="center">
  <img src="docs/assets/demo.gif" alt="Applye-Demo - Stellenanzeige einfügen, Recruiter-Check erhalten, CV anpassen, Bewerbung verfolgen" width="800">
</p>

**Applye** ist eine quelloffene, local-first Desktop-App für die KI-gestützte Jobsuche. Sie bewertet
Stellen gegen dein Profil, passt deinen Lebenslauf pro Ausschreibung an, entwirft Anschreiben und
Follow-ups, bereitet dich auf Interviews vor und verwaltet die gesamte Pipeline - alles auf deinem
Rechner. Keine Cloud, kein Konto, keine Telemetrie. Du bringst die KI mit, die du ohnehin bezahlst,
und jedes Absenden bleibt eine menschliche Entscheidung.

Zuerst für den deutschen/europäischen Markt gebaut, überall nützlich.

## Inhaltsverzeichnis

- [Warum Applye](#warum-applye)
- [Funktionen](#funktionen)
- [Schnellstart](#schnellstart)
- [Nutzung: der Kernablauf](#nutzung-der-kernablauf)
- [Wie es funktioniert](#wie-es-funktioniert)
- [Screenshots](#screenshots)
- [Projektstruktur](#projektstruktur)
- [Tech-Stack](#tech-stack)
- [Roadmap](#roadmap)
- [Mitwirken](#mitwirken)
- [Über den Autor](#über-den-autor)
- [Haftungsausschluss](#haftungsausschluss)
- [Lizenz](#lizenz)

## Warum Applye

**Augmentierung statt Automatisierung.** Das ist das erste Prinzip, und alles andere ordnet sich
ihm unter.

KI assistiert. Du entscheidest. Applye wird niemals automatisch Bewerbungen abschicken oder etwas in
deinem Namen einreichen. Es bewertet, entwirft und schlägt vor - und gibt dir dann die Kontrolle
zurück. Jede KI-Ausgabe ist ein Vorschlag, den du liest, bearbeitest und annimmst oder verwirfst.
Kein Hintergrund-Agent vertritt dich still gegenüber einem Recruiter.

Warum das wichtig ist:

- Ein Recruiter oder Hiring Manager ist ein Mensch, und die Beziehung gehört dir, nicht einem Bot.
- Massenhaft automatisierte Bewerbungen sind Rauschen; ein Werkzeug, das dir hilft, _weniger, aber
  bessere_ zu senden, ist der Punkt.
- Du bleibst für jedes Wort verantwortlich, das unter deinem Namen rausgeht.

Wenn eine Funktion verlangt, diese Kontrolle aufzugeben, wird sie nicht ausgeliefert.

## Funktionen

| Funktion                     | Was sie tut                                                                                                                                                                                            | Tokens     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| **Dashboard**                | Ein Bildschirm mit Pipeline-Status, fälligen Follow-ups und letzter Aktivität.                                                                                                                         | 0          |
| **Discover**                 | Scannt deine konfigurierten Quellen (Remotive, Himalayas, RSS-Feeds, Greenhouse-, Lever-, Ashby-Portale) über HTTPS, filtert lokal nach Keywords und Geografie und zeigt einen Match-Score pro Stelle. | 0          |
| **Paste-Pipeline**           | Füge eine beliebige Stellenanzeige ein; Applye extrahiert Firma, Titel, Gehalt und Sprache, führt einen deterministischen Legitimitäts-Check aus (Ghost-Job- und Scam-Signale) und legt die Stelle ab. | 0          |
| **Recruiter-Check**          | Eine opt-in KI-Einschätzung der Stelle gegen dein Profil: Fit-Score, fehlende Keywords, Red Flags und ein ehrliches Urteil, bevor du Zeit investierst.                                                 | opt-in     |
| **CV-Anpassung**             | Ein mehrstufiger Anpassungsprozess, der dein Profil auf die Ausschreibung zuschneidet - du prüfst jede Änderung - exportiert als PDF.                                                                  | opt-in     |
| **Anschreiben**              | Ein Anschreiben-Entwurf pro Stelle, aus deinem Profil und der Ausschreibung gebaut, zum Prüfen und Exportieren. Du redigierst, du sendest.                                                             | opt-in     |
| **Pipeline-Kanban**          | Beworben, Interview, Angebot - ziehe Stellen über die Phasen; die Statushistorie schreibt sich selbst.                                                                                                 | 0          |
| **Job-Tracker & Follow-ups** | Jede Bewerbung mit Daten, Status, Notizen und Follow-up-Entwürfen, wenn eine Stelle verstummt.                                                                                                         | 0 / opt-in |
| **Interview-Vorbereitung**   | Eine Timeline der Interview-Phasen pro Bewerbung - Termine, Interviewer, Status und deine Notizen.                                                                                                     | 0          |
| **Analytics**                | Funnel-Konversion, Pipeline-Alter, Bewerbungsverteilung - lokal aus deinen eigenen Daten berechnet.                                                                                                    | 0          |
| **Deutschland-Werkzeuge**    | Eigenbemühungen-Nachweis für die Agentur für Arbeit, deutschsprachige Dokumente, Blue-Card-Bewusstsein.                                                                                                | 0 / opt-in |
| **Mehrsprachige Oberfläche** | Englisch, Deutsch, Russisch, Spanisch, Französisch, Ukrainisch.                                                                                                                                        | 0          |

Die Spalte "Tokens" ist ein Design-Vertrag: Alles mit **0** läuft vollständig offline mit
deterministischem Code. KI wird nur dort ausgegeben, wo Urteilsvermögen wirklich nötig ist, und nur
wenn du klickst.

## Schnellstart

### Download

> **PLACEHOLDER: Release-Links.** Installierbare Builds (Windows `.msi`, macOS `.dmg`, Linux
> `.AppImage`/`.deb`) werden zum öffentlichen Launch auf der
> [Releases-Seite](https://github.com/vitala89/applye/releases) veröffentlicht. Bis dahin: unten aus
> dem Quellcode bauen.

### Aus dem Quellcode bauen

**Voraussetzungen:** Node 20+, Rust (stable, Edition 2021) und die
[Tauri-2-Systemabhängigkeiten](https://v2.tauri.app/start/prerequisites/) für dein Betriebssystem.

```bash
git clone https://github.com/vitala89/applye.git
cd applye
npm install

npm run desktop:dev      # startet die Tauri + Angular App im Dev-Modus
```

Weitere nützliche Skripte:

```bash
npm run desktop:build    # Produktions-Build der Desktop-App
npm run web:dev          # applye.dev-Website lokal starten
npm test                 # Test-Suite ausführen
npm run lint             # alle Projekte linten
npm run type-check       # Typprüfung aller Projekte
```

KI-Funktionen sind aus, bis du in den **Einstellungen** einen Schlüssel oder eine CLI-Brücke
hinterlegst. Die App ist ohne sie voll nutzbar.

## Nutzung: der Kernablauf

1. **Einfügen** - eine Stellenanzeige einfügen (oder **Discover** Stellen aus deinen Quellen holen lassen).
2. **Prüfen** - ein deterministischer Legitimitäts-Check, dann ein optionaler KI-Recruiter-Blick auf den Fit.
3. **Anpassen** - eine mehrstufige CV-Anpassung, die du Zeile für Zeile prüfst, exportiert als PDF.
4. **Bewerben** - du kopierst, du öffnest die Ausschreibung, du sendest. Applye protokolliert; es klickt nie für dich.
5. **Verfolgen** - die Stelle wandert über das Pipeline-Kanban; Follow-up-Entwürfe erscheinen bei Funkstille.
6. **Vorbereiten** - jede Interview-Phase auf einer Timeline verfolgen und Notizen pro Stelle festhalten.

<!-- PLACEHOLDER: Video-Walkthrough. Ein 2-3-minütiger kommentierter Durchlauf des Kernablaufs auf YouTube; hier das Thumbnail docs/assets/walkthrough-thumb.png einbetten und aufs Video verlinken. -->

## Wie es funktioniert

**Local-first und privat.** Dein Profil, deine Stellenliste, Notizen und generierten Dokumente
liegen in einer lokalen SQLite-Datenbank auf deinem Rechner. Die Kernabläufe funktionieren komplett
ohne Netz. Keine Konten, keine Telemetrie, kein Cloud-Sync. Nichts von deiner Suche verlässt das
Gerät, außer _du_ löst einen KI-Aufruf aus - und selbst dann wird nur das Minimum für genau diese
Anfrage gesendet. DSGVO-freundlich, weil es nichts zu leaken gibt - es existiert kein Server mit
deinen Daten.

**Bring deine eigene KI.** Applye bündelt kein Modell und verkauft keine Tokens weiter. Du
verbindest die KI, die du ohnehin bezahlst:

- **API-Schlüssel** - richte Applye auf eine Provider-API (Anthropic Claude, OpenAI, Google Gemini, DeepSeek) mit deinem eigenen Schlüssel.
- **CLI-Brücke** - oder route über eine lokale KI-CLI, die du schon hast (Claude Code, Codex, Gemini CLI).

In beiden Fällen gehören die Schlüssel dir, die Abrechnung dir, und die ganze App läuft auch mit
abgeschalteter KI.

**Token-Ökonomie.** KI wird als knappe, bezahlte Ressource behandelt - nicht überall verstreut:

- **Alles wird gecacht.** Identische Eingaben zahlen nie zweimal (`jd_hash -> scoring`, `input_hash -> output`).
- **Nur Opt-in-Aufrufe.** Nichts erreicht ein Modell, bis du es anforderst.
- **Sparsame Prompts.** Funktionen sind auf die kleinste nützliche Anfrage zugeschnitten, sodass
  eine echte Jobsuche Cents kostet, kein Abo.

**Zur Quellen-Legalität.** Applye ist ein Werkzeug, das du auf Stellenanzeigen richtest, die **du**
ohnehin gerade ansiehst. Es scrapt keine Jobbörsen, umgeht keine Logins und sammelt keine Anzeigen
in großem Stil. Discover ruft nur öffentliche APIs und Feeds ab, die für Software gedacht sind.
Respektiere die Nutzungsbedingungen jeder Seite, die du verwendest - die App ist so gebaut, dass du
auf der richtigen Seite bleibst, weil sie Sammlung und Absenden nie automatisiert.

## Screenshots

| Dashboard                                                                                   | Discover                                                                                                                    |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| ![Dashboard](docs/assets/screens/dashboard.png) <br> _Pipeline-Status + fällige Follow-ups_ | ![Discover](docs/assets/screens/discover.png) <br> _der Feed, gruppiert nach deinen Zielrollen, mit dem jeweiligen Treffer_ |

| Job-Detail & Recruiter-Check                                                                                  | CV-Anpassung                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| ![Job-Detail](docs/assets/screens/job-detail.png) <br> _fehlende Keywords, der ATS-Check und die Warnsignale_ | ![Anpassung](docs/assets/screens/tailoring.png) <br> _der Review-Schritt des Assistenten, mit angepasstem CV und Anschreiben_ |

| Pipeline-Kanban                                                                             | Analytics                                                                                                      |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| ![Pipeline](docs/assets/screens/pipeline.png) <br> _Spalten Beworben / Interview / Angebot_ | ![Analytics](docs/assets/screens/analytics.png) <br> _Zähler, der Bewerbungs-Funnel und das Volumen pro Woche_ |

## Projektstruktur

```
applye/
├── apps/
│   ├── desktop/          # Tauri-2-Desktop-App
│   │   ├── src/          # Angular-Frontend (Dashboard, Discover, Jobs, Pipeline, ...)
│   │   └── src-tauri/    # Rust-Backend: SQLite, Scan-Engine, Scoring, KI-Brücke
│   ├── web/              # applye.dev - Landing, Doku, Methodik, Changelog
│   └── mobile/           # Platzhalter für eine künftige Companion-App
├── libs/
│   ├── core/             # Domänenmodelle und Interfaces
│   ├── data/             # Tauri-Invoke-Wrapper und Service-Abstraktionen
│   ├── ui/               # geteilte Angular-Komponenten und Design-Tokens
│   ├── i18n/             # Übersetzungen (en, de, ru, es, fr, uk)
│   └── skills/           # versionierte Prompt-/Skill-Inhalte
├── docs/                 # Architektur-, Produkt- und Design-Doku
└── design-system/        # Design-Quelle der Wahrheit für jeden Screen
```

## Tech-Stack

| Ebene         | Wahl                                      | Warum                                                   |
| ------------- | ----------------------------------------- | ------------------------------------------------------- |
| Desktop-Shell | [Tauri 2](https://v2.tauri.app)           | Native Webview, kleine Binaries, Rust-Backend           |
| Backend       | Rust 2021 + SQLite (sqlx)                 | Deterministische, schnelle, komplett offline Datenebene |
| Frontend      | Angular 21 + TypeScript                   | Signals, Standalone-Komponenten, strikte Typen          |
| State         | NgRx Signals                              | Lokaler, vorhersagbarer UI-State                        |
| Monorepo      | [Nx](https://nx.dev)                      | Ein Repo für Desktop, Web und geteilte Bibliotheken     |
| Qualität      | Jest, ESLint, Prettier, Husky, commitlint | Tests und Conventional Commits verpflichtend            |

Siehe [`docs/architecture.md`](docs/architecture.md) für den Aufbau und den
[Entscheidungsfilter](docs/decision-filter.md), gegen den jede Änderung geprüft wird.

## Roadmap

Der kurzfristige Plan lebt in [ROADMAP.md](ROADMAP.md); ausgelieferte Arbeit steht im
[CHANGELOG.md](CHANGELOG.md). Als Nächstes: mehr Discover-Quellen, tiefere Interview-Vorbereitung
und installierbare Release-Builds für alle drei Plattformen.

## Mitwirken

Beiträge sind willkommen - Issues, Doku, Übersetzungen und Code.

- Lies [CONTRIBUTING.md](CONTRIBUTING.md) für Setup, Branch-Ablauf und Commit-Konventionen.
- Sei freundlich: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Sicherheitslücke gefunden? Siehe [SECURITY.md](SECURITY.md) - bitte kein öffentliches Issue öffnen.

## Über den Autor

Applye wird von **[Vitalii Kasap](https://vitaliikasap.com)** gebaut, einem Frontend-Ingenieur in
Deutschland, während genau der Jobsuche, für die die App gemacht ist. Jede Funktion erscheint, weil
sie in einer echten Suche gebraucht wurde - nicht, weil sie in einer Demo gut aussieht.

**Ebenfalls Open Source:** Applyes Pipeline-Philosophie ist offen inspiriert von
[career-ops](https://github.com/santifer/career-ops) von Santiago Fernández de Valderrama Aparicio -
einem brillanten CLI-first-Ansatz für dasselbe Problem. career-ops gibt Entwicklern eine CLI; Applye
gibt allen einen Desktop. Wenn du im Terminal lebst, gib ihm einen Stern.

## Haftungsausschluss

Applye ist ein persönliches Produktivitätswerkzeug. Es garantiert keine Interviews, Angebote oder
Anstellungen. KI-Ausgaben sind Entwürfe, die falsch sein können - prüfe alles, bevor du es
abschickst. Applye sendet niemals Bewerbungen in deinem Namen und erfindet niemals Erfahrung;
Ehrlichkeit vor Übertreibung ist eine Design-Regel, kein Vorschlag. Diese Software wird unter der
[MIT-Lizenz](LICENSE) "wie besehen" bereitgestellt, ohne Gewährleistung jeglicher Art. Applye ist
mit keiner in diesem Dokument genannten Jobbörse, keinem ATS-Anbieter und keinem KI-Anbieter
verbunden.

## Lizenz

[MIT](LICENSE) © 2026 Vitalii Kasap
