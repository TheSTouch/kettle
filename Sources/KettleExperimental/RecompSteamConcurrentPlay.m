// RecompSteam_SetConcurrentPlay (RecompSteamSession.h, where the rules are explained): what
// the session claims in ClientGamesPlayed while the account plays on another device. Built
// only with the ConcurrentPlay trait (KettleFeatures.h); without it the session uses the Deny
// stand-ins in RecompSteamInternal.h. Everything here runs on the session queue.
#include "RecompSteamInternal.h"

#if KETTLE_CONCURRENT_PLAY

static int gPolicy;            // RecompSteamConcurrentPlay, written on the queue
static bool gSettled;          // Steam said since the logon whether the account plays elsewhere, or 5 s passed
static bool gBlocked;          // what it said
static bool gClaiming;         // the last ClientGamesPlayed on this connection listed the games
static uint64_t gLogon;        // bumps per logon

bool RecompSteam_ClaimsGame(int policy, bool settled, bool blocked)
{
    if (policy != RecompSteamConcurrentPlayAllow) return true;
    return settled && !blocked;
}

int RecompSteam_LogOffRetryDelay(int policy, int32_t eresult)
{
    if (eresult != RecompSteamResultLoggedInElsewhere) return 0;
    return policy == RecompSteamConcurrentPlayAllow ? 0 : 120;   // Deny: another device took the game, retry slowly
}

// Claims the games, or takes the claim back, when the rules' answer changed.
static void Update(void)
{
    if (RecompSteam_ClaimsGame(gPolicy, gSettled, gBlocked) != gClaiming) RS_SendGamesPlayed();
}

int RS_PlayingListGames(void)
{
    bool claim = RecompSteam_ClaimsGame(gPolicy, gSettled, gBlocked);
    if (!claim && !gClaiming) return -1;   // Allow, withheld, and nothing claimed to take back
    gClaiming = claim;
    return claim;
}

void RS_PlayingLoggedOn(void)
{
    gSettled = gBlocked = gClaiming = false;
    uint64_t logon = ++gLogon;
    // Steam says right after logon when the account plays elsewhere, and says nothing otherwise.
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC), RecompSteam_Queue(), ^{
        if (logon != gLogon || gSettled) return;
        gSettled = true;
        if (gPolicy == RecompSteamConcurrentPlayAllow) Update();
    });
}

void RS_PlayingState(bool blocked)
{
    gBlocked = blocked;
    gSettled = true;
    if (gPolicy == RecompSteamConcurrentPlayAllow) Update();
}

int RS_PlayingLogOffRetry(int32_t eresult) { return RecompSteam_LogOffRetryDelay(gPolicy, eresult); }

void RecompSteam_SetConcurrentPlay(int policy)
{
    int p = policy == RecompSteamConcurrentPlayAllow ? RecompSteamConcurrentPlayAllow : RecompSteamConcurrentPlayDeny;
    dispatch_async(RecompSteam_Queue(), ^{
        if (p == gPolicy) return;
        __atomic_store_n(&gPolicy, p, __ATOMIC_RELAXED);
        RecompSteam_Log("concurrent play: %s", p == RecompSteamConcurrentPlayAllow ? "allow" : "deny");
        Update();
    });
}

int RecompSteam_ConcurrentPlay(void) { return __atomic_load_n(&gPolicy, __ATOMIC_RELAXED); }

#endif
