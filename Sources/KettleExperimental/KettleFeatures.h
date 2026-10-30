// Which experimental parts are built in, one switch each, so a game that does not want a
// part does not carry its code. SwiftPM sets them from the package's traits (Package.swift:
// SignIn, Cloud, Tickets on by default, ConcurrentPlay off) and defines
// KETTLE_EXPERIMENTAL_CONFIGURED. A build outside SwiftPM gets the same defaults below;
// to choose for itself it defines KETTLE_EXPERIMENTAL_CONFIGURED and the parts it wants.
//
//   KETTLE_SIGN_IN          signing in as a Steam client: QR, password, Steam Guard (RecompSteamAuth.h)
//   KETTLE_CLOUD            Steam Cloud list, download, upload (RecompSteamCloud.h)
//   KETTLE_TICKETS          app ownership and auth session tickets (RecompSteamSession.h)
//   KETTLE_CONCURRENT_PLAY  RecompSteam_SetConcurrentPlay; without it the session is always Deny
//
// The session, the protobuf codec and the token helpers are always built. Calling a function
// of a part left out fails to link.
#ifndef KETTLE_FEATURES_H
#define KETTLE_FEATURES_H

#ifndef KETTLE_EXPERIMENTAL_CONFIGURED
#define KETTLE_SIGN_IN 1
#define KETTLE_CLOUD 1
#define KETTLE_TICKETS 1
#endif

#endif
