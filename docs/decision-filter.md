# The decision filter

Every architectural choice in Applye is run through these seven questions first. If a change can't
answer them well, it doesn't ship. This keeps the app honest about what it is: a fast, private,
solo-maintainable tool that augments the user.

Before any architectural choice, ask:

1. **Does it work offline?**
   Core workflows must function with no network. If a feature only works online, it's not core.

2. **Does it respect privacy?**
   The user's data stays on the device. Nothing leaves unless the user explicitly triggers it, and
   then only the minimum for that one request.

3. **Does it stay fast on low-end hardware?**
   The target user may be job-hunting on a modest laptop. No choice that assumes a powerful machine.

4. **Does it augment (not replace) the user?**
   AI proposes; the user decides. Nothing is auto-applied or auto-sent. This is the non-negotiable
   one — see the augmentation principle in the [README](../README.md).

5. **Is it the simplest solution?**
   The minimum that solves the problem. No speculative abstractions, no flexibility nobody asked for.

6. **Does it fit the token budget?**
   AI is a scarce paid resource. Cache aggressively, prompt frugally, and keep features opt-in.

7. **Can it be maintained solo?**
   One person has to own this. Favor boring, well-understood tools over clever ones.

## How to use it

When a choice is genuinely hard, write down each answer. The questions are ordered roughly by how
often they kill a bad idea — most over-engineering dies on #5, most scope creep on #4, and most
"let's add a backend" ideas on #1 and #2.

A "no" to any question isn't an automatic veto, but it _is_ a reason to stop and justify the
exception out loud rather than slip it in silently.
