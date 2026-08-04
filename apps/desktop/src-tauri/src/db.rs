// Database layer - SQLite via sqlx (Phase 1).
// WAL mode, single shared connection pool, all queries async.
// The pool is held in Tauri managed state; all SQL lives in Rust (commands/*).

use std::path::Path;

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::SqlitePool;

/// Shared database handle stored in Tauri state.
pub struct Db {
    pub pool: SqlitePool,
}

impl Db {
    /// Open (or create) `applye.db` in the app-data directory, enable WAL +
    /// foreign keys, and run all pending migrations. Idempotent across launches.
    pub async fn init(app_data_dir: &Path) -> Result<Self, String> {
        // Tauri's sandbox / a fresh install may not have the dir yet.
        std::fs::create_dir_all(app_data_dir).map_err(|e| format!("create app data dir: {e}"))?;

        let path = app_data_dir.join("applye.db");

        let options = SqliteConnectOptions::new()
            .filename(&path)
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal)
            .foreign_keys(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await
            .map_err(|e| format!("open database: {e}"))?;

        // Migrations are embedded at compile time from ./migrations.
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .map_err(|e| format!("run migrations: {e}"))?;

        Ok(Self { pool })
    }
}

/// Stable, dependency-free hash of normalized text (FNV-1a, 64-bit, hex).
///
/// Used for `jd_hash` dedupe and future cache keys. Deterministic across runs
/// and machines (unlike `DefaultHasher`), which is what the UNIQUE index needs.
/// 0 tokens - plain code.
pub fn stable_hash(input: &str) -> String {
    let normalized = normalize_text(input);
    const FNV_OFFSET: u64 = 0xcbf29ce484222325;
    const FNV_PRIME: u64 = 0x100000001b3;
    let mut hash = FNV_OFFSET;
    for byte in normalized.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    format!("{hash:016x}")
}

/// Lowercase + collapse all whitespace so trivially different pastes of the
/// same job (extra spaces, line breaks, casing) hash identically.
fn normalize_text(input: &str) -> String {
    input
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

#[cfg(test)]
mod tests {
    /// sqlx records a SHA-384 of every applied migration in `_sqlx_migrations`
    /// and refuses to start when a file it already applied no longer hashes the
    /// same. Editing a shipped migration - even one character in a comment -
    /// therefore bricks the app for every existing install, and there is no
    /// recovery path from inside the app. A repo-wide text sweep did exactly
    /// that once (the em dash cleanup in 0.28.0).
    ///
    /// These checksums are the frozen record of what users have already run.
    /// A failure here means a shipped migration was edited: restore the file
    /// byte for byte and put the change in a new migration instead. Only a
    /// genuinely new migration may add a line to this table.
    const PINNED_CHECKSUMS: &[(i64, &str)] = &[
        (1, "6f21ecf6b959dc45df06c5c5208b57db440c457a374c36d7021faeb36a038ebc998a2da4b2dd849579ae576e0de8d9c6"),
        (2, "dcf9ad09c91a9d2a95227a6b2e63c2af33c79c507a12f4662a72776f0b7a27fa5f3ceb49daaaf31edd8c776cd8336142"),
        (3, "3e5f7e4729c2499e80b42cfd7fdb59111338bacfabaadba982b784b6130122e07e364878f54d479a46527dac4ddcadcf"),
        (4, "a8e24d31f541db22b3c5d18360a0ecda35153def26bb665bf178d124b1ae7d202a6e1c1496c81d2439222284222b36ec"),
        (5, "02f0b3b8b180c8697ae51cf6c6cefa29e80f286c3909d5da7094fae162997c6534d508e0effb09e15af9816eb4615721"),
        (6, "b435d750287f646aaf7987b9b326923d7dd630dc300677832c75e69a59369f36ac89b5b8b94e1d353a91fff83e573b81"),
        (7, "4004eb2f5837a7a7a6d92b1456b314d31c7519a0778261a300140cb108832dfcf1df6c7fa5ba5cf2c0540ed5a14f91e2"),
        (8, "3bcbb41f3502e1ff544feaf8f65ba984c761e03336b18b8f1f63d730118a247d492d1b4f3030ef759eeb6ec04fa1e6c8"),
        (9, "8623d126e1c0da5ccdedbe5c05bb1930f204f0e0ebcc0d6c420ed3380ef6c69d68f9aee483f32b6c7683d1dd2245813d"),
        (10, "c79e686731eb19a062e641a6abbf0494de6dbe77edaee1bd94dfc427445f39b3a7fe54603d05bc41067c6cb0d025ce5d"),
        (11, "b8647e35724fa7b6f77aed2bcf9a21e6ee8d6dff8778d6e915ee2a707f431d6d443486e665912114187755b2b5f06840"),
        (12, "436335f6c380faa82d6a264176b0c4d238c8402bd9dc6efbff59fc796b5aa8838d8195c62532274fe4502f4a48f59106"),
        (13, "ee651e5cda4ab48d2e0045bbf3a256e02295a8c9f1a8c74164b1bbf127f6c3e1684f80f4d8ab1a85765b6ec0c1f4870c"),
        (14, "e57bb8dd8be2177083493780da6aa42b7c11fd8c087e2389ee376ab35619168351418a969f66557ead352dbf8da0bef8"),
        (15, "0e0c47db5a75ede734da8f6c348299bc578b7b66276c242e23f79a7825d057cefc5b3c1dd1977fd0a07b165c6f19a428"),
        (16, "5e28b490b8b787b785d536c474c133a042caef0859eb07db3713894e553ac0f6e5771d8a703ab651f3100e6c5d59acd9"),
        (17, "473c2667b0b797d3d55030e89a14241b3ebc69228b6b9269ebc23a3624c163a24f76309246e3fa71b95d7a46940cf0d3"),
        (18, "e2296bba54272989e9bf79946030fd2e3bb4ab9c453feda053c618e9412c3f31ee5309592a33b9fbee16d2a7ccdaf7a6"),
        (19, "bd817144280c3074197967316ca0a2f66a94bf4f5098be2deac7011bd6f9fa1ae70891a866740ada01e1f37f855c65cf"),
        (20, "bbe9abcc5fb7c55dd8030eb4ee8e079659139383e559f1699f2a80fcf996f106470e5c754e91b8307cce822bc864da44"),
        (21, "e2f9f644bc9310b1a844a4c424e6b467275e29de6201af84cf8998a7b5748446d627ebff873299672f99149302ffe749"),
        (22, "816dac160bb5c576f0dcf2a9d172e9214302107ba0064acb8a0b67127cc8df0a8bbac3b8e68dbd9d8b7f4e798ad244e0"),
        (23, "1e823a9721ee5d76ef4da9ead457dcae1cbcd8052a3348be03034024b06050d525413e8826e228e52f41be87b0525464"),
        (24, "af577429d92ada7515e3d0646d0218c846f734ee6751933bb291d2d706916b012a6caab639c6a2cc39de68eef577ab9f"),
        (25, "2edd2a041b67980849fd9b120fbcf0fd6b03b556cb7d78c35af5b4ffd1a9289f1fa0f586714cde069997ed326b1af349"),
        (26, "89aabe49b84227e966535a27133f28cb80dc329c867daeaca3003cb015a0291dd0715c9a21bc72c7eff0ee04c90007c3"),
        (27, "6dd55ec8bc09b48fd3d10b07dc30d8761c0e85d9826dcec1d4ba5171514e97d97a8812445a54df62cd854624883338e6"),
        (28, "e953172d50c980bccb669b36e49346c033a7f55b2229f2a84568a88b1053cafbcd1bdb78e1e1aacb28e4f82c5c992523"),
        (29, "a0bfc43834427023d05e9159a4f6ff17027599eeb64f2f8638f81b10db89d17507725a0e372be959812b8b3aeb75b41f"),
    ];

    #[test]
    fn applied_migrations_are_never_edited() {
        let migrator = sqlx::migrate!("./migrations");

        for migration in migrator.iter() {
            let actual = migration
                .checksum
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>();

            match PINNED_CHECKSUMS
                .iter()
                .find(|(version, _)| *version == migration.version)
            {
                Some((_, expected)) => assert_eq!(
                    &actual, expected,
                    "migration {} was edited after shipping; restore it byte for byte \
                     and put the change in a new migration",
                    migration.version
                ),
                None => panic!(
                    "migration {} is not pinned; add ({}, \"{}\") to PINNED_CHECKSUMS",
                    migration.version, migration.version, actual
                ),
            }
        }

        for (version, _) in PINNED_CHECKSUMS {
            assert!(
                migrator.iter().any(|m| m.version == *version),
                "pinned migration {version} no longer exists; migrations may not be deleted"
            );
        }
    }
}
