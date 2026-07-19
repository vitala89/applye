# Legal Disclaimer & Acceptable Use

_Last updated: 2026-07-19_

This document explains what Applye is, what it is not, and the terms under which you may use it. It
supplements - and does not replace - the [MIT License](LICENSE) that governs the source code. If any
part of this disclaimer is unacceptable to you, do not use the software.

## 1. Nature of the Project

Applye is an open-source desktop application (a Tauri 2 shell with an Angular frontend and a Rust
backend) that you download and run on your own machine. It is strictly a **local execution tool**.

The maintainers do not host, deploy, or operate a service on your behalf. There is no Applye server,
no Applye account, and no Applye-provided access to Large Language Models (LLMs). You install the
app, it stores data in a local SQLite database on your device, and - only if you choose - it connects
to an AI provider using **your own** key or a **local AI CLI you already run**. The maintainers have
no visibility into, control over, or responsibility for how the software is used after you install
it.

## 2. Data Privacy (GDPR)

The maintainers do not act as a Data Controller or Data Processor under the GDPR or any other data
protection regulation, because the maintainers never receive your data.

- All Personal Identifiable Information (PII) you enter - CVs, contact details, career history, notes,
  job listings, generated documents - is processed and stored **locally on your machine**.
- Applye collects **no analytics, no telemetry, and no usage data** of any kind. There is no server
  to send it to.
- When you trigger an AI feature, only the minimum data needed for that one request is sent **directly
  from your machine to the AI provider you configured** (Anthropic, OpenAI, Google, DeepSeek, or a
  local CLI bridge). That transfer is governed by that provider's privacy policy and terms - review
  them. The maintainers are not a party to it.
- API keys, credentials, and personal files are gitignored by default. If you fork the repository,
  never commit them to a public fork.
- Because your data never leaves your device except on an AI call you initiate, exporting, deleting,
  or wiping it is entirely under your control - it is your local database.

## 3. AI Model Behavior

Applye interfaces with AI models via third-party APIs and CLI tools. The maintainers do not build,
train, host, or control these models and cannot guarantee their behavior.

- **Hallucinations.** AI models may fabricate skills, employment history, qualifications, dates,
  salaries, or company information. You must **manually verify every generated document** - CVs,
  cover letters, follow-ups, answers - before sending it to anyone. Honesty over inflation is a
  design rule of this project, but the final accuracy check is always yours.
- **Human-in-the-loop by design.** Applye never auto-applies, auto-sends, or auto-submits anything.
  It scores, drafts, and suggests, then hands control back to you. Every submission is a manual human
  action you take yourself. If you modify the prompts, swap models, or wire in automation on top of
  the app to remove that boundary, you accept full responsibility for the result.
- **Evaluation accuracy.** Fit scores, recruiter checks, legitimacy signals, and recommendations are
  AI- or heuristic-generated opinions based on pattern matching. They are **not** professional career,
  legal, immigration, or financial advice. They should inform your judgment, not replace it.

## 4. Third-Party Platforms and Sources

Applye's Discover feature fetches from public job APIs and feeds (for example Remotive, Himalayas,
RSS feeds, and public Greenhouse, Lever, and Ashby boards). The paste pipeline works on job
descriptions you have already opened yourself.

- Applye does **not** scrape job boards, bypass logins, solve CAPTCHAs, or harvest postings at scale.
  It reads only public endpoints intended to be consumed by software.
- You must comply with the Terms of Service of every platform, board, and provider you interact with,
  including any AI provider whose key you supply.
- Do not use Applye to spam employers, overwhelm applicant tracking systems, or submit mass
  applications. The project exists to help you send _fewer, better_ applications.
- Any consequences of a Terms-of-Service violation - including rate limits, IP bans, account
  restrictions, or action by a platform or provider - are solely your responsibility.
- The maintainers will reject contributions whose purpose is to facilitate scraping, login bypass,
  auto-submission, or other Terms-of-Service violations (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## 5. Acceptable Use

Applye is designed to help individuals make better career decisions, not to automate away human
judgment or to deceive employers. Acceptable use includes:

- Evaluating and prioritizing roles to spend your time well.
- Generating tailored CVs and cover letters that **you review and edit** before submitting.
- Reading public job feeds and pasting descriptions you are already considering.
- Tracking your own application pipeline, interviews, and follow-ups.

Prohibited use includes: fabricating credentials or experience; impersonating another person;
scraping or automating access to platforms that forbid it; mass or automated submission of
applications; and any use that violates applicable law or a third party's terms.

## 6. Not Professional Advice

Applye's German-market helpers (for example the Eigenbemühungen report for the Agentur für Arbeit and
Blue-Card awareness prompts) are convenience features, not legal, tax, or immigration advice. Rules
change and vary by individual circumstance. Verify any official requirement with the relevant
authority or a qualified professional before you rely on it.

## 7. No Warranty

> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
> NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
> NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
> DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
> OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Applye does not guarantee interviews, offers, or employment. Any career outcome depends on factors
entirely outside the software.

## 8. Limitation of Liability

To the maximum extent permitted by applicable law, the maintainers and contributors shall not be
liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of
data, opportunities, or income, arising from your use of - or inability to use - Applye, even if
advised of the possibility of such damages.

## 9. Indemnification

By using Applye, you agree to indemnify, defend, and hold harmless the authors, contributors, and any
affiliated parties from and against any and all claims, damages, losses, liabilities, costs, and
expenses (including reasonable attorneys' fees) arising from your use of this software, your
violation of these terms, or your violation of any third-party terms of service.

## 10. Trademarks and Affiliation

The "Applye" name, wordmark, and brand identity are separate from the MIT license that governs the
source code. The MIT license grants broad rights to use, modify, and redistribute the code; it does
not grant rights to use the project name or logo for commercial product naming, endorsement claims,
or affiliation messaging.

Applye is an independent project. It is **not affiliated with, endorsed by, or sponsored by** any job
board, applicant-tracking vendor, AI provider, or government agency named anywhere in this repository.
All third-party names and marks belong to their respective owners.

## 11. Changes to This Disclaimer

This disclaimer may be updated as the project evolves. Material changes are noted in
[CHANGELOG.md](CHANGELOG.md). Users are encouraged to review this document periodically. Continued use
of the software after an update constitutes acceptance of the revised terms.

---

For security issues, follow the process in [SECURITY.md](SECURITY.md). For contribution rules, see
[CONTRIBUTING.md](CONTRIBUTING.md). For conduct expectations, see
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
