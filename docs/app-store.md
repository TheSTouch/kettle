# Passing App Store review with Steam ownership

> **Our reading, not legal advice.** This summarises Apple's and Valve's rules as we understand them. It may contain mistakes or be out of date: rely only on the official documents linked here, not on our description.

What a game using Kettle needs for App Review. The rules named here are Apple's
[App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) and the
[Apple Developer Program License Agreement](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/);
both change, so read their current text before you submit.

## The unlock: Steam is a second way in, never the only one

A Steam copy is a purchase made in another store. Unlocking a full version inside the app
must go through in-app purchase, and an app may not use its own unlock mechanisms such as
licence keys ([3.1.1](https://developer.apple.com/app-store/review/guidelines/#3.1.1)). An
app that works on several platforms may let people use what they bought elsewhere,
"provided those items are also available as in-app purchases within the app"
([3.1.3(b), Multiplatform Services](https://developer.apple.com/app-store/review/guidelines/#3.1.3b)).

| How the game is sold on iOS | What Steam does | Review |
|---|---|---|
| Paid app | optional sign-in for achievements, saves, online play | fine |
| Free download, unlocked by an in-app purchase **or** by owning it on Steam | a free unlock for Steam owners | fine ([3.1.3(b)](https://developer.apple.com/app-store/review/guidelines/#3.1.3b)); this is what `UnlockGate` does |
| Free download, playable only by owning it on Steam | the only way in | likely rejected ([3.1.1](https://developer.apple.com/app-store/review/guidelines/#3.1.1)) |

Links to buy the game on Steam: in apps on the United States storefront, the guidelines no
longer forbid buttons and links to other ways to buy; elsewhere, an app and its metadata
may not include buttons, external links or other calls to action that lead to purchasing
mechanisms other than in-app purchase ([3.1.1(a)](https://developer.apple.com/app-store/review/guidelines/#3.1.1a),
[3.1.3](https://developer.apple.com/app-store/review/guidelines/#3.1.3)). Leave the Steam
store out of the unlock screen unless you sell only where it is allowed.

## Sign-in

- **Login services ([4.8](https://developer.apple.com/app-store/review/guidelines/#4.8)).**
  An app that uses a third-party login "to set up or authenticate the user's primary account
  with the app" must also offer an equivalent login service that limits what it collects to
  name and email, lets people keep their email private, and does not collect their
  interactions with the app for advertising without consent. With `UnlockGate` the Steam
  sign-in is optional (the game can be bought and played without any account), so Steam is
  not the primary account. Say so in the review notes.
- **Account deletion ([5.1.1(v)](https://developer.apple.com/app-store/review/guidelines/#5.1.1v)).**
  An app that supports account creation must offer account deletion within the app; see
  Apple's [Offering account deletion in your app](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion).
  When your server keeps anything tied to the Steam ID, call `KettleClient.deleteAccount()`
  from your settings screen, and delete the data in your server's `DELETE /steam/account`.
- **Privacy label ([App privacy details](https://developer.apple.com/app-store/app-privacy-details/)).**
  The Steam ID is a "User ID" ("screen name, handle, account ID, assigned user ID, ...") that
  the app collects, linked to the user. Add whatever else your server keeps.

## Review notes

- Give App Review a Steam account that owns the game (and its password), and say where the
  "Sign in through Steam" button is.
- Say that the game can be bought in the app, and that Steam owners unlock it for free.
- For the sandbox purchase, nothing special: StoreKit's sandbox applies.

## The experimental module

`KettleExperimental` signs in as a Steam client inside the app. Prefer its QR sign-in
(approved in the Steam Mobile app) to typing a Steam password into the game. Read
[valve.md](valve.md) before shipping it at all.
