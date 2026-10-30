// Steam Cloud, shared by the cloud*.m files: the Cloud service (cloud_protocol.m), the
// sync with local folders (cloud_sync.m), ISteamRemoteStorage on a folder
// (cloud_remotestorage.m) and the hooks into the game's life (cloud_launch.m).
//
// Steam Cloud names a file by its Auto-Cloud root and path ("%WinMyDocuments%Timberborn/
// Saves/a.timber") or, for what a game writes through ISteamRemoteStorage, by the bare
// name it gave ("characters/x.fch"). Each app has a change number that grows with
// every upload batch.
#import <Foundation/Foundation.h>

#define CLOG(fmt, ...) RecompSteam_Log("cloud: %s", [[NSString stringWithFormat:fmt, ##__VA_ARGS__] UTF8String])

// --- cloud_protocol.m: the Cloud service --------------------------------------------
// Synchronous: call from a queue of your own, never the session's or the main one.

@interface RSCloudFile : NSObject
@property (nonatomic, copy) NSString *name;
@property (nonatomic, copy) NSData *sha;        // SHA-1 of the raw file
@property (nonatomic) uint64_t size, time;      // raw size; Unix time of its last change
@property (nonatomic, copy) NSString *machine;  // what last uploaded it, when Steam says
@end

// Every file Steam Cloud holds for the app (deleted and forgotten ones left out).
NSArray<RSCloudFile *> *RSCloudList(uint32_t appid, uint64_t *change, NSString **error);
// One file's raw bytes, unzipped and checked against its SHA-1.
NSData *RSCloudDownload(uint32_t appid, NSString *name, NSString **error);
// One upload batch: uploads (name -> file path, with its time) and deletes.
BOOL RSCloudCommit(uint32_t appid, NSString *machine, NSDictionary<NSString *, NSString *> *uploads,
                   NSDictionary<NSString *, NSNumber *> *times, NSArray<NSString *> *deletes, NSString **error);
NSData *RSCloudSHA1(NSData *data);
NSString *RSCloudHex(NSData *data);

