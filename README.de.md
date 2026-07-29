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
  <img src="https://img.shields.io/badge/version-0.29.0-4F5BFF?style=flat" alt="Version 0.29.0">
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
- [Wo Discover sucht](#wo-discover-sucht)
- [Screenshots](#screenshots)
- [Projektstruktur](#projektstruktur)
- [Tech-Stack](#tech-stack)
- [Roadmap](#roadmap)
- [FAQ](#faq)
- [Mitwirken](#mitwirken)
- [Über den Autor](#über-den-autor)
- [Ebenfalls Open Source](#ebenfalls-open-source)
- [Haftungsausschluss](#haftungsausschluss)
- [Lizenz](#lizenz)
- [Kontakt](#kontakt)

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

<p align="center">
  <a href="https://applye.dev/docs/guide/tour/">
    <img src="docs/assets/walkthrough-thumb.png" alt="Den Rundgang durch den ersten Start von Applye ansehen" width="800">
  </a>
  <br>
  <em>Ein stummer Rundgang durch die sechs Bildschirme des ersten Starts, auf applye.dev.</em>
</p>

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

## Wo Discover sucht

Applye bringt eine Reihe eingebauter Quellen mit, und **jede einzelne ist ab Werk ausgeschaltet**.
Das Sammeln ist eine ausdrückliche Entscheidung: du aktivierst die Quellen, die zu deinem Markt
passen, und vorher wird nichts abgerufen. Jede Quelle ist eine öffentliche API oder ein RSS-Feed,
der zum maschinellen Lesen gedacht ist, und jede trägt in der App einen Hinweis zur Rechtslage.

| Quelle                   | Typ | Markt       | Hinweis                                          |
| ------------------------ | --- | ----------- | ------------------------------------------------ |
| Remotive                 | API | Weltweit    | Remote-Stellen, öffentliche API                  |
| We Work Remotely         | RSS | Weltweit    | Öffentlicher RSS-Feed                            |
| Himalayas                | API | Weltweit    | Remote-Stellen, öffentliche API                  |
| Jobicy                   | RSS | Weltweit    | Öffentlicher RSS-Feed                            |
| Arbeitnow                | API | Europa      | Öffentliche API, viele deutschsprachige Stellen  |
| Bundesagentur für Arbeit | API | Deutschland | Offizielle REST-API der Bundesagentur für Arbeit |
| No Fluff Jobs            | API | Polen       | Öffentliche API, IT-Fokus                        |
| DOU.ua                   | RSS | Ukraine     | Öffentlicher RSS-Feed                            |
| Djinni.co                | RSS | Ukraine     | Öffentlicher RSS-Feed                            |
| Habr Career              | RSS | RU-Markt    | Öffentlicher RSS-Feed                            |
| TrudVsem (Rostrud)       | API | RU-Markt    | Offizielle öffentliche API                       |

Zusätzlich kannst du **Karriereseiten einzelner Unternehmen** einbinden: Greenhouse, Lever, Ashby
und Personio. Zeig Applye das Board einer Firma, und ihre Stellen erscheinen neben den Aggregatoren
im Discover-Feed. Beliebige eigene RSS-Feeds gehen ebenfalls.

Was Applye bewusst **nicht** tut: es scrapt keine HTML-Jobbörsen, meldet sich nirgends in deinem
Namen an und sammelt keine Stellenanzeigen im großen Stil ein. Hat eine Seite keinen
maschinenlesbaren Feed, liest Applye sie nicht.

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

![Tauri](https://img.shields.io/badge/Tauri_2-24C8DB?style=flat&logo=tauri&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-000000?style=flat&logo=rust&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat&logo=sqlite&logoColor=white)
![Angular](https://img.shields.io/badge/Angular_21-DD0031?style=flat&logo=angular&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Nx](https://img.shields.io/badge/Nx-143055?style=flat&logo=nx&logoColor=white)
![Jest](https://img.shields.io/badge/Jest-C21325?style=flat&logo=jest&logoColor=white)

Siehe [`docs/architecture.md`](docs/architecture.md) für den Aufbau und den
[Entscheidungsfilter](docs/decision-filter.md), gegen den jede Änderung geprüft wird.

## Roadmap

Der kurzfristige Plan lebt in [ROADMAP.md](ROADMAP.md); ausgelieferte Arbeit steht im
[CHANGELOG.md](CHANGELOG.md). Als Nächstes: mehr Discover-Quellen, tiefere Interview-Vorbereitung
und installierbare Release-Builds für alle drei Plattformen.

## FAQ

**Was ist Applye?**
Applye ist eine kostenlose, quelloffene Desktop-App für eine KI-gestützte Jobsuche, die lokal
läuft. Sie bewertet Stellenanzeigen gegen dein Profil, passt deinen Lebenslauf pro Stelle an,
entwirft Anschreiben und Nachfassnachrichten und führt die gesamte Pipeline auf deinem Rechner.
Sie läuft auf Windows, macOS und Linux und bewirbt sich niemals für dich.

**Ist Applye kostenlos? Brauche ich ein Konto?**
Ja, kostenlos und MIT-lizenziert, und es gibt kein Konto. Keine Registrierung, kein Server, kein
Abo: du lädst die App herunter, und sie funktioniert. Bezahlen musst du höchstens die KI, die du
anbindest, und zwar direkt bei deinem Anbieter, nie bei Applye.

**Bewirbt sich Applye für mich?**
Nein, und das wird sich nicht ändern. Applye bewertet, entwirft und schlägt vor; du prüfst,
bearbeitest und schickst ab. Es gibt keine automatische Bewerbung, keinen automatischen Versand und
keinen Hintergrund-Agenten, der in deinem Namen mit Recruitern spricht. Der Mensch in der Schleife
ist das erste Designprinzip, keine Einstellung.

**Wo liegen meine Daten?**
In einer lokalen SQLite-Datenbank auf deinem Rechner, neben den Dokumenten, die Applye erzeugt.
Keine Cloud, keine Synchronisierung, keine Telemetrie. Nichts verlässt das Gerät, bis du selbst
einen KI-Aufruf auslöst, und dann geht nur das Minimum für diese eine Anfrage an den Anbieter.

**Welche KI-Anbieter unterstützt Applye?**
Du bringst deinen eigenen mit: einen API-Schlüssel für Anthropic Claude oder DeepSeek, oder eine
Brücke zu einer lokalen KI-CLI wie Claude Code oder Codex, über die auch OpenAI-Modelle erreichbar
sind. Schlüssel und Abrechnung bleiben deine. Jede KI-Funktion ist Opt-in, und die App ist mit
abgeschalteter KI voll nutzbar.

**Geht Applye ohne KI oder ohne Internet?**
Ja. Dashboard, Pipeline-Kanban, Tracker, Interview-Zeitleiste, Analytics und die deterministische
Seriositätsprüfung laufen offline und ohne Token. KI wird nur dort ausgegeben, wo wirklich
Urteilsvermögen nötig ist, und nur auf deinen Klick.

**Scrapt Applye Jobbörsen?**
Nein. Discover liest öffentliche APIs und RSS-Feeds, die zum maschinellen Lesen veröffentlicht
werden, dazu Karriereseiten von Unternehmen (Greenhouse, Lever, Ashby, Personio), die du selbst
hinzufügst. Es scrapt kein HTML, umgeht keine Logins und sammelt keine Anzeigen im großen Stil.
Alle eingebauten Quellen sind ab Werk deaktiviert.

**Ist Applye nur für Deutschland?**
Nein. Es ist zuerst für den deutschen und europäischen Markt gebaut - mit
Eigenbemühungen-Nachweis für die Agentur für Arbeit, deutschsprachigen Dokumenten und Blue-Card-
Bewusstsein -, aber die Quellen decken weltweite, polnische, ukrainische und RU-Märkte ab, und die
Oberfläche spricht Englisch, Deutsch, Russisch, Spanisch, Französisch und Ukrainisch.

**Welche Plattformen werden unterstützt?**
Windows, macOS (Apple Silicon und Intel) und Linux. Installer werden auf der
[Releases-Seite](https://github.com/vitala89/applye/releases) veröffentlicht; das Bauen aus dem
Quellcode steht im [Schnellstart](#schnellstart).

## Mitwirken

Beiträge sind willkommen - Issues, Doku, Übersetzungen und Code.

- Lies [CONTRIBUTING.md](CONTRIBUTING.md) für Setup, Branch-Ablauf und Commit-Konventionen.
- Unklar, wohin mit einer Frage? [SUPPORT.md](SUPPORT.md) ordnet sie zu.
- Sei freundlich: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Sicherheitslücke gefunden? Siehe [SECURITY.md](SECURITY.md) - bitte kein öffentliches Issue öffnen.

**Applye hat dir zu etwas verholfen?**
[Erzähl die Geschichte](https://github.com/vitala89/applye/issues/new?template=applye-helped.yml) -
das ist die einzige Kennzahl dieses Projekts, weil in der App nichts gemessen wird.

## Über den Autor

Applye wird von **[Vitalii Kasap](https://vitaliikasap.com)** gebaut, einem Frontend-Ingenieur in
Deutschland, während genau der Jobsuche, für die die App gemacht ist. Jede Funktion erscheint, weil
sie in einer echten Suche gebraucht wurde - nicht, weil sie in einer Demo gut aussieht.

## Ebenfalls Open Source

- **[career-ops](https://github.com/santifer/career-ops)** von Santiago Fernández de Valderrama
  Aparicio - das Projekt, wegen dem ich das hier bauen wollte. Ein brillanter CLI-first-Ansatz für
  dasselbe Problem: es macht aus jeder KI-Coding-CLI eine Kommandozentrale für die Jobsuche.
  career-ops gibt Entwicklern eine CLI; Applye gibt allen einen Desktop. Wenn du im Terminal lebst,
  geh hin und gib ihm einen Stern.

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

## Kontakt

[![Website](https://img.shields.io/badge/vitaliikasap.com-4F5BFF?style=for-the-badge&logo=safari&logoColor=white)](https://vitaliikasap.com)
[![LinkedIn](https://img.shields.io/badge/Vitalii_Kasap-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/vitaliikasap/)
[![X](https://img.shields.io/badge/@vitala89-000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/vitala89)
[![GitHub](https://img.shields.io/badge/vitala89-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/vitala89)
[![Discussions](https://img.shields.io/badge/Frage_stellen-Discussions-2ea44f?style=for-the-badge&logo=github&logoColor=white)](https://github.com/vitala89/applye/discussions)
