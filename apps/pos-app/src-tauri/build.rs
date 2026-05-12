#[path = "src/migration_discovery.rs"]
mod migration_discovery;

use std::{env, fmt::Write as _, fs, path::PathBuf};

fn main() {
    println!("cargo:rustc-link-arg=-Wl,-z,max-page-size=16384");
    println!("cargo:rustc-link-arg=-Wl,-z,common-page-size=16384");
    println!("cargo:rerun-if-changed=../../../packages/protobuf/proto/sync.proto");
    println!("cargo:rerun-if-changed=../../../packages/protobuf/proto/assets.proto");
    println!("cargo:rerun-if-changed=src/migration_discovery.rs");

    let protoc = protoc_bin_vendored::protoc_bin_path().expect("failed to find protoc binary");
    std::env::set_var("PROTOC", protoc);
    prost_build::compile_protos(
        &[
            "../../../packages/protobuf/proto/sync.proto",
            "../../../packages/protobuf/proto/assets.proto",
        ],
        &["../../../packages/protobuf/proto"],
    )
    .expect("failed to compile protobuf sync schema");

    generate_migration_manifest();

    tauri_build::build()
}

fn generate_migration_manifest() {
    let manifest_dir =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set"));
    let migration_dir = manifest_dir.join("../drizzle");
    println!("cargo:rerun-if-changed={}", migration_dir.display());
    let migrations = migration_discovery::collect_migration_files(&migration_dir)
        .expect("failed to discover drizzle migrations");

    for migration in &migrations {
        println!("cargo:rerun-if-changed={}", migration.path.display());
    }

    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR not set"));
    let generated = out_dir.join("drizzle_migrations.rs");

    let mut source = String::new();
    source.push_str(
        "pub struct MigrationAsset {\n    pub name: &'static str,\n    pub sql: &'static str,\n}\n\n",
    );
    source.push_str("pub const MIGRATIONS: &[MigrationAsset] = &[\n");

    for migration in migrations {
        writeln!(
            source,
            "    MigrationAsset {{ name: {:?}, sql: include_str!(concat!(env!(\"CARGO_MANIFEST_DIR\"), \"/../drizzle/\", {:?})) }},",
            migration.name,
            migration.file_name
        )
        .expect("failed to write migration manifest");
    }

    source.push_str("];\n");

    fs::write(&generated, source).expect("failed to write generated migration manifest");
}
