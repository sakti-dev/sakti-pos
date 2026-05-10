fn main() {
    println!("cargo:rustc-link-arg=-Wl,-z,max-page-size=16384");
    println!("cargo:rustc-link-arg=-Wl,-z,common-page-size=16384");
    println!("cargo:rerun-if-changed=../../../packages/protobuf/proto/sync.proto");

    let protoc = protoc_bin_vendored::protoc_bin_path().expect("failed to find protoc binary");
    std::env::set_var("PROTOC", protoc);
    prost_build::compile_protos(
        &["../../../packages/protobuf/proto/sync.proto"],
        &["../../../packages/protobuf/proto"],
    )
    .expect("failed to compile protobuf sync schema");

    tauri_build::build()
}
