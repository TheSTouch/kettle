# Passing App Store review with Steam ownership

What a game using Kettle needs for App Review. These are readings of Apple's [App Review
Guidelines](https://developer.apple.com/app-store/review/guidelines/), not legal advice, and
the guidelines change: check the current text of the rules named here before you submit.

## The unlock: Steam is a second way in, never the only one

A Steam copy is a purchase made in another store. Apple lets an app honour purchases made
elsewhere only when the same thing can also be bought in the app (3.1.3(b), multiplatform
services); an app that is locked unless you bought it somewhere else falls under 3.1.1.

| How the game is sold on iOS | What Steam does | Review |
|---|---|---|
| Paid app | optional sign-in for achievements, saves, online play | fine |
| Free download, unlocked by an in-app purchase **or** by owning it on Steam | a free unlock for Steam owners | fine (3.1.3(b)); this is what `UnlockGate` does |
| Free download, playable only by owning it on Steam | the only way in | likely rejected (3.1.1) |

Do not link to the Steam store from the unlock screen to buy the game, unless the
storefront's current rules on external purchase links allow it where you sell.

## Sign-in

- **Sign in with Apple (4.8).** When Steam is the game's only account system, 4.8 can ask
  for an equivalent privacy-friendly login next to it. With `UnlockGate` the Steam sign-in is
  optional (the game can be bought and played without any account), which keeps it out of
  that rule's way. Say so in the review notes.
- **Account deletion (5.1.1(v)).** When your server keeps anything tied to the Steam ID, the
  app needs a way to delete it: call `KettleClient.deleteAccount()` from your settings
  screen, and delete the data in your server's `DELETE /steam/account`.
- **Privacy label.** The Steam ID is a user ID the app collects (linked to the user). Add
  whatever else your server keeps.

## Review notes

- Give App Review a Steam account that owns the game (and its password), and say where the
  "Sign in with Steam" button is.
- Say that the game can be bought in the app, and that Steam owners unlock it for free.
- For the sandbox purchase, nothing special: StoreKit's sandbox applies.

## The experimental module

`KettleExperimental` signs in as a Steam client inside the app. Prefer its QR sign-in
(approved in the Steam Mobile app) to typing a Steam password into the game. Read
[valve.md](valve.md) before shipping it at all.
